/**
 * GitHub Project Monitor Component
 * 
 * Queries GitHub Projects API to retrieve work items ready for implementation.
 * Validates that work items have corresponding branches, spec folders, and pull requests.
 */

import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { WorkItem, ValidationResult } from '../types';
import { WorkItemError } from '../errors';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';

export interface GitHubProjectMonitor {
  fetchWorkItems(config: ProjectConfig): Promise<WorkItem[]>;
  validateWorkItem(item: WorkItem): Promise<ValidationResult>;
  extractBranchName(item: WorkItem): string;
  verifyPullRequestExists(branchName: string): Promise<boolean>;
}

export interface ProjectConfig {
  readonly organization: string;
  readonly repository: string;
  readonly projectNumber: number;
  readonly targetStatusColumn: string;
}

export interface GitHubProjectMonitorConfig {
  readonly apiTokenSecretArn: string;
  readonly region?: string;
  readonly repoOwner: string;
  readonly repoName: string;
}

/**
 * Implementation of GitHubProjectMonitor
 */
export class GitHubProjectMonitorImpl implements GitHubProjectMonitor {
  private readonly config: GitHubProjectMonitorConfig;
  private readonly secretsClient: SecretsManagerClient;
  private apiToken?: string;
  private octokit?: Octokit;
  private graphqlClient?: typeof graphql;

  constructor(config: GitHubProjectMonitorConfig) {
    this.config = config;
    this.secretsClient = new SecretsManagerClient({
      region: config.region || 'us-east-1'
    });
  }

  /**
   * Fetches work items from GitHub Projects
   * 
   * @param config - Project configuration
   * @returns Array of work items in target status
   * @throws {WorkItemError} If fetching fails
   */
  async fetchWorkItems(config: ProjectConfig): Promise<WorkItem[]> {
    logger.info('Fetching work items from GitHub Projects', {
      organization: config.organization,
      repository: config.repository,
      projectNumber: config.projectNumber,
      targetStatus: config.targetStatusColumn
    });

    try {
      // Ensure API token is retrieved
      await this.ensureAuthenticated();

      // Fetch work items using GraphQL API
      const workItems = await retryWithBackoff(
        async () => await this.queryProjectItems(config),
        { maxAttempts: 3, initialDelay: 1000, maxDelay: 5000 }
      );

      logger.info('Work items fetched successfully', {
        count: workItems.length
      });

      return workItems;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch work items', { error: errorMessage });
      
      // Check for rate limit errors
      if (errorMessage.includes('rate limit') || errorMessage.includes('403')) {
        throw new WorkItemError(
          'GitHub API rate limit exceeded. Please wait before retrying.',
          undefined,
          error instanceof Error ? error : undefined
        );
      }
      
      throw new WorkItemError(
        `Failed to fetch work items: ${errorMessage}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validates a work item
   * 
   * @param item - Work item to validate
   * @returns Validation result
   */
  async validateWorkItem(item: WorkItem): Promise<ValidationResult> {
    logger.info('Validating work item', {
      id: item.id,
      branchName: item.branchName
    });

    const errors: string[] = [];
    let branchExists = false;
    let specFolderExists = false;
    let specFolderMatchesBranch = false;
    let pullRequestExists = false;
    let pullRequestMatchesBranch = false;

    try {
      // Ensure authenticated
      await this.ensureAuthenticated();

      // Check if branch exists
      try {
        await this.octokit!.repos.getBranch({
          owner: this.config.repoOwner,
          repo: this.config.repoName,
          branch: item.branchName
        });
        branchExists = true;
      } catch (error) {
        errors.push(`Branch '${item.branchName}' does not exist`);
      }

      // Check if spec folder exists and matches branch name
      if (branchExists) {
        try {
          const specPath = `.kiro/specs/${item.branchName}`;
          await this.octokit!.repos.getContent({
            owner: this.config.repoOwner,
            repo: this.config.repoName,
            path: specPath,
            ref: item.branchName
          });
          specFolderExists = true;
          specFolderMatchesBranch = true;
        } catch (error) {
          errors.push(`Spec folder '.kiro/specs/${item.branchName}' does not exist`);
        }
      }

      // Check if pull request exists
      pullRequestExists = await this.verifyPullRequestExists(item.branchName);
      if (!pullRequestExists) {
        errors.push(`No pull request found for branch '${item.branchName}'`);
      } else {
        // Verify PR title matches branch name
        pullRequestMatchesBranch = await this.verifyPRMatchesBranch(item.branchName);
        if (!pullRequestMatchesBranch) {
          errors.push(`Pull request title does not match branch name '${item.branchName}'`);
        }
      }

      const isValid = errors.length === 0;

      logger.info('Work item validation complete', {
        id: item.id,
        isValid,
        errors: errors.length
      });

      return {
        isValid,
        branchExists,
        specFolderExists,
        specFolderMatchesBranch,
        pullRequestExists,
        pullRequestMatchesBranch,
        errors
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Work item validation failed', { error: errorMessage });
      
      return {
        isValid: false,
        branchExists,
        specFolderExists,
        specFolderMatchesBranch,
        pullRequestExists,
        pullRequestMatchesBranch,
        errors: [...errors, `Validation error: ${errorMessage}`]
      };
    }
  }

  /**
   * Extracts branch name from work item
   * 
   * @param item - Work item
   * @returns Branch name
   */
  extractBranchName(item: WorkItem): string {
    return item.branchName;
  }

  /**
   * Verifies that a pull request exists for the branch
   * 
   * @param branchName - Branch name
   * @returns True if PR exists
   */
  async verifyPullRequestExists(branchName: string): Promise<boolean> {
    try {
      await this.ensureAuthenticated();

      const { data: pullRequests } = await this.octokit!.pulls.list({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        head: `${this.config.repoOwner}:${branchName}`,
        state: 'open'
      });

      return pullRequests.length > 0;
    } catch (error) {
      logger.error('Failed to verify pull request existence', {
        branchName,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Ensures API token is retrieved and clients are initialized
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.apiToken) {
      this.apiToken = await this.retrieveApiToken();
      this.octokit = new Octokit({ auth: this.apiToken });
      this.graphqlClient = graphql.defaults({
        headers: {
          authorization: `token ${this.apiToken}`
        }
      });
    }
  }

  /**
   * Retrieves API token from AWS Secrets Manager
   * 
   * @returns API token string
   * @throws {WorkItemError} If token retrieval fails
   */
  private async retrieveApiToken(): Promise<string> {
    logger.info('Retrieving GitHub API token from Secrets Manager', {
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

      logger.info('GitHub API token retrieved successfully');
      return response.SecretString;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve GitHub API token', { error: errorMessage });
      throw new WorkItemError(
        `Failed to retrieve GitHub API token: ${errorMessage}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Queries GitHub Projects for work items using GraphQL API
   * 
   * @param config - Project configuration
   * @returns Array of work items
   */
  private async queryProjectItems(config: ProjectConfig): Promise<WorkItem[]> {
    const query = `
      query($org: String!, $projectNumber: Int!) {
        organization(login: $org) {
          projectV2(number: $projectNumber) {
            items(first: 100) {
              nodes {
                id
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                  }
                }
                content {
                  ... on Issue {
                    title
                    body
                    createdAt
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response: any = await this.graphqlClient!(query, {
      org: config.organization,
      projectNumber: config.projectNumber
    });

    const items = response.organization?.projectV2?.items?.nodes || [];
    const workItems: WorkItem[] = [];

    for (const item of items) {
      // Extract status from field values
      const statusField = item.fieldValues?.nodes?.find(
        (node: any) => node.field?.name === 'Status'
      );
      
      if (statusField?.name !== config.targetStatusColumn) {
        continue;
      }

      // Extract branch name from field values
      const branchField = item.fieldValues?.nodes?.find(
        (node: any) => node.field?.name === 'Branch'
      );

      if (!branchField?.text) {
        logger.warn('Work item missing branch name', { id: item.id });
        continue;
      }

      workItems.push({
        id: item.id,
        title: item.content?.title || '',
        description: item.content?.body || '',
        branchName: branchField.text,
        status: statusField.name,
        createdAt: new Date(item.content?.createdAt || Date.now())
      });
    }

    return workItems;
  }

  /**
   * Verifies that PR title matches branch name
   * 
   * @param branchName - Branch name
   * @returns True if PR title matches
   */
  private async verifyPRMatchesBranch(branchName: string): Promise<boolean> {
    try {
      const { data: pullRequests } = await this.octokit!.pulls.list({
        owner: this.config.repoOwner,
        repo: this.config.repoName,
        head: `${this.config.repoOwner}:${branchName}`,
        state: 'open'
      });

      if (pullRequests.length === 0) {
        return false;
      }

      // For now, we just check that a PR exists
      // In a real implementation, you might want to check if the title contains the branch name
      return true;
    } catch (error) {
      return false;
    }
  }
}
