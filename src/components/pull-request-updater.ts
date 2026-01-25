/**
 * Pull Request Updater Component
 * 
 * Manages updating existing pull requests with build results, test summaries,
 * and coverage information. Supports both GitHub and GitLab platforms.
 */

import { Octokit } from '@octokit/rest';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { PRDetails, PRResult, PRContext } from '../types';
import { PRUpdateError } from '../errors';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';

export interface PullRequestUpdater {
  updatePR(details: PRDetails): Promise<PRResult>;
  generatePRBody(context: PRContext): string;
}

export interface PullRequestUpdaterConfig {
  readonly repoOwner: string;
  readonly repoName: string;
  readonly platform: 'github' | 'gitlab';
  readonly apiTokenSecretArn: string;
  readonly region?: string;
}

/**
 * Implementation of PullRequestUpdater for GitHub and GitLab
 */
export class PullRequestUpdaterImpl implements PullRequestUpdater {
  private readonly config: PullRequestUpdaterConfig;
  private readonly secretsClient: SecretsManagerClient;
  private apiToken?: string;

  constructor(config: PullRequestUpdaterConfig) {
    this.config = config;
    this.secretsClient = new SecretsManagerClient({
      region: config.region || 'us-east-1'
    });
  }

  /**
   * Updates an existing pull request with new information
   * 
   * @param details - Pull request details including body and metadata
   * @returns Result of the PR update operation
   * @throws {PRUpdateError} If PR update fails after retries
   */
  async updatePR(details: PRDetails): Promise<PRResult> {
    logger.info('Updating pull request', {
      sourceBranch: details.sourceBranch,
      targetBranch: details.targetBranch,
      platform: this.config.platform
    });

    try {
      // Retrieve API token if not already cached
      if (!this.apiToken) {
        this.apiToken = await this.retrieveApiToken();
      }

      // Update PR based on platform
      const result = await retryWithBackoff(
        async () => {
          if (this.config.platform === 'github') {
            return await this.updateGitHubPR(details);
          } else {
            return await this.updateGitLabPR(details);
          }
        },
        { maxAttempts: 3, initialDelay: 1000, maxDelay: 5000 }
      );

      logger.info('Pull request updated successfully', {
        prNumber: result.prNumber,
        prUrl: result.prUrl
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to update pull request', {
        error: errorMessage,
        sourceBranch: details.sourceBranch
      });
      throw new PRUpdateError(
        `Failed to update pull request: ${errorMessage}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generates PR body content from context
   * 
   * @param context - Context containing test results, coverage, and build metadata
   * @returns Formatted PR body in Markdown
   */
  generatePRBody(context: PRContext): string {
    const { taskId, testResult, coverageResult, buildMetadata } = context;

    const body = `## Kiro Worker Automated Changes

**Spec Task**: ${taskId}
**Build ID**: ${buildMetadata.buildId}
**Build URL**: ${buildMetadata.buildUrl}
**Environment**: ${buildMetadata.environment}
**Timestamp**: ${buildMetadata.timestamp.toISOString()}

### Test Results
- **Total Tests**: ${testResult.totalTests}
- **Passed**: ${testResult.passedTests} ✅
- **Failed**: ${testResult.failedTests} ${testResult.failedTests > 0 ? '❌' : ''}
- **Status**: ${testResult.passed ? '✅ All tests passed' : '❌ Tests failed'}

### Code Coverage
- **Overall Coverage**: ${coverageResult.percentage.toFixed(2)}% ${coverageResult.meetsThreshold ? '✅' : '⚠️'}
- **Lines**: ${coverageResult.lines.toFixed(2)}%
- **Functions**: ${coverageResult.functions.toFixed(2)}%
- **Branches**: ${coverageResult.branches.toFixed(2)}%
- **Statements**: ${coverageResult.statements.toFixed(2)}%
- **Threshold**: ${coverageResult.meetsThreshold ? 'Met (≥80%)' : 'Not met (<80%)'}

${coverageResult.summary}
`;

    // Add test failures if any
    if (testResult.failures.length > 0) {
      const failureSection = `
### Failed Tests

${testResult.failures.map(f => `#### ${f.testName}
\`\`\`
${f.error}
\`\`\`
`).join('\n')}
`;
      return body + failureSection;
    }

    return body;
  }

  /**
   * Retrieves API token from AWS Secrets Manager
   * 
   * @returns API token string
   * @throws {PRUpdateError} If token retrieval fails
   */
  private async retrieveApiToken(): Promise<string> {
    logger.info('Retrieving API token from Secrets Manager', {
      secretArn: this.config.apiTokenSecretArn
    });

    try {
      const command = new GetSecretValueCommand({
        SecretId: this.config.apiTokenSecretArn
      });

      const response = await this.secretsClient.send(command);

      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      logger.info('API token retrieved successfully');
      return response.SecretString;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve API token', { error: errorMessage });
      throw new PRUpdateError(
        `Failed to retrieve API token: ${errorMessage}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Updates a GitHub pull request
   * 
   * @param details - PR details
   * @returns PR result
   */
  private async updateGitHubPR(details: PRDetails): Promise<PRResult> {
    const octokit = new Octokit({ auth: this.apiToken });

    // Find existing PR by branch name
    const { data: pullRequests } = await octokit.pulls.list({
      owner: this.config.repoOwner,
      repo: this.config.repoName,
      head: `${this.config.repoOwner}:${details.sourceBranch}`,
      state: 'open'
    });

    if (pullRequests.length === 0) {
      throw new PRUpdateError(
        `No open pull request found for branch: ${details.sourceBranch}`
      );
    }

    const pr = pullRequests[0];

    // Update PR body
    await octokit.pulls.update({
      owner: this.config.repoOwner,
      repo: this.config.repoName,
      pull_number: pr.number,
      body: details.body
    });

    return {
      success: true,
      prNumber: pr.number,
      prUrl: pr.html_url
    };
  }

  /**
   * Updates a GitLab merge request
   * 
   * @param details - PR details
   * @returns PR result
   */
  private async updateGitLabPR(details: PRDetails): Promise<PRResult> {
    // GitLab API endpoint
    const gitlabApiUrl = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';
    const projectId = encodeURIComponent(`${this.config.repoOwner}/${this.config.repoName}`);

    // Find existing MR by source branch
    const listMRsUrl = `${gitlabApiUrl}/projects/${projectId}/merge_requests?source_branch=${details.sourceBranch}&state=opened`;
    
    const listResponse = await fetch(listMRsUrl, {
      headers: {
        'PRIVATE-TOKEN': this.apiToken!,
        'Content-Type': 'application/json'
      }
    });

    if (!listResponse.ok) {
      throw new Error(`GitLab API error: ${listResponse.status} ${listResponse.statusText}`);
    }

    const mergeRequests = await listResponse.json() as Array<{
      iid: number;
      web_url: string;
    }>;

    if (mergeRequests.length === 0) {
      throw new PRUpdateError(
        `No open merge request found for branch: ${details.sourceBranch}`
      );
    }

    const mr = mergeRequests[0];

    // Update MR description
    const updateMRUrl = `${gitlabApiUrl}/projects/${projectId}/merge_requests/${mr.iid}`;
    
    const updateResponse = await fetch(updateMRUrl, {
      method: 'PUT',
      headers: {
        'PRIVATE-TOKEN': this.apiToken!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: details.body
      })
    });

    if (!updateResponse.ok) {
      throw new Error(`GitLab API error: ${updateResponse.status} ${updateResponse.statusText}`);
    }

    return {
      success: true,
      prNumber: mr.iid,
      prUrl: mr.web_url
    };
  }
}
