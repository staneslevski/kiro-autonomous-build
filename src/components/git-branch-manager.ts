/**
 * Git Branch Manager - Handles Git operations for the Kiro Worker
 */

import simpleGit, { SimpleGit } from 'simple-git';
import { Octokit } from '@octokit/rest';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GitOperationError, ValidationError } from '../errors';
import { ValidationResult } from '../types';
import { retryWithBackoff } from '../utils/retry';
import { logger } from '../utils/logger';

export interface GitBranchManagerConfig {
  readonly repoPath: string;
  readonly region?: string;
  readonly gitCredentialsSecretArn?: string;
  readonly githubTokenSecretArn?: string;
}

export interface GitCredentials {
  readonly username: string;
  readonly token: string;
}

export class GitBranchManager {
  private readonly git: SimpleGit;
  private readonly config: GitBranchManagerConfig;
  private readonly secretsClient: SecretsManagerClient;
  private octokit?: Octokit;

  constructor(config: GitBranchManagerConfig) {
    this.config = config;
    this.git = simpleGit(config.repoPath);
    this.secretsClient = new SecretsManagerClient({ 
      region: config.region || 'us-east-1' 
    });
  }

  /**
   * Checkout a branch with retry logic
   */
  async checkoutBranch(branchName: string): Promise<void> {
    logger.info('Checking out branch', { branchName });

    try {
      await retryWithBackoff(async () => {
        // Fetch latest changes
        await this.git.fetch();
        
        // Check if branch exists remotely
        const branches = await this.git.branch(['-r']);
        const remoteBranch = `origin/${branchName}`;
        
        if (!branches.all.includes(remoteBranch)) {
          throw new GitOperationError(
            `Branch ${branchName} does not exist remotely`,
            'checkout'
          );
        }

        // Checkout the branch
        await this.git.checkout(branchName);
        
        logger.info('Branch checked out successfully', { branchName });
      });
    } catch (error) {
      const gitError = new GitOperationError(
        `Failed to checkout branch ${branchName}`,
        'checkout',
        error instanceof Error ? error : undefined
      );
      logger.error('Branch checkout failed', gitError, { branchName });
      throw gitError;
    }
  }

  /**
   * Validate that spec files exist for the branch
   */
  async validateSpecFiles(branchName: string): Promise<ValidationResult> {
    logger.info('Validating spec files', { branchName });

    const specPath = path.join(this.config.repoPath, '.kiro', 'specs', branchName);
    const errors: string[] = [];

    try {
      // Check if spec folder exists
      let specFolderExists = false;
      try {
        const stats = await fs.stat(specPath);
        specFolderExists = stats.isDirectory();
      } catch {
        specFolderExists = false;
        errors.push(`Spec folder does not exist: ${specPath}`);
      }

      // Check for required files
      const requiredFiles = ['requirements.md', 'design.md', 'tasks.md'];
      const filesExist = {
        requirements: false,
        design: false,
        tasks: false
      };

      if (specFolderExists) {
        for (const file of requiredFiles) {
          const filePath = path.join(specPath, file);
          try {
            await fs.access(filePath);
            const key = file.replace('.md', '') as keyof typeof filesExist;
            filesExist[key] = true;
          } catch {
            errors.push(`Required file missing: ${file}`);
          }
        }
      }

      const isValid = specFolderExists && 
                     filesExist.requirements && 
                     filesExist.design && 
                     filesExist.tasks;

      const result: ValidationResult = {
        isValid,
        branchExists: true,
        specFolderExists,
        specFolderMatchesBranch: specFolderExists,
        pullRequestExists: false,
        pullRequestMatchesBranch: false,
        requiredFilesExist: filesExist,
        errors
      };

      logger.info('Spec validation complete', { branchName, isValid, errors });
      return result;
    } catch (error) {
      const validationError = new ValidationError(
        'Spec validation failed',
        errors,
        error instanceof Error ? error : undefined
      );
      logger.error('Spec validation error', validationError, { branchName });
      throw validationError;
    }
  }

  /**
   * Validate that a pull request exists for the branch
   */
  async validatePullRequestExists(branchName: string, owner: string, repo: string): Promise<boolean> {
    logger.info('Validating pull request exists', { branchName, owner, repo });

    try {
      if (!this.octokit) {
        await this.initializeOctokit();
      }

      const result = await retryWithBackoff(async () => {
        const { data: pulls } = await this.octokit!.pulls.list({
          owner,
          repo,
          head: `${owner}:${branchName}`,
          state: 'open'
        });

        return pulls.length > 0;
      });

      logger.info('Pull request validation complete', { branchName, exists: result });
      return result;
    } catch (error) {
      const prError = new GitOperationError(
        `Failed to validate pull request for branch ${branchName}`,
        'validatePR',
        error instanceof Error ? error : undefined
      );
      logger.error('Pull request validation failed', prError, { branchName });
      throw prError;
    }
  }

  /**
   * Commit changes to the current branch
   */
  async commitChanges(message: string, files: string[]): Promise<void> {
    logger.info('Committing changes', { message, fileCount: files.length });

    try {
      await retryWithBackoff(async () => {
        // Add files
        await this.git.add(files);
        
        // Commit
        await this.git.commit(message);
        
        logger.info('Changes committed successfully', { message });
      });
    } catch (error) {
      const commitError = new GitOperationError(
        'Failed to commit changes',
        'commit',
        error instanceof Error ? error : undefined
      );
      logger.error('Commit failed', commitError, { message });
      throw commitError;
    }
  }

  /**
   * Push branch to remote
   */
  async pushBranch(branchName: string): Promise<void> {
    logger.info('Pushing branch', { branchName });

    try {
      await retryWithBackoff(async () => {
        await this.git.push('origin', branchName);
        logger.info('Branch pushed successfully', { branchName });
      });
    } catch (error) {
      const pushError = new GitOperationError(
        `Failed to push branch ${branchName}`,
        'push',
        error instanceof Error ? error : undefined
      );
      logger.error('Push failed', pushError, { branchName });
      throw pushError;
    }
  }

  /**
   * Retrieve Git credentials from AWS Secrets Manager
   */
  private async getGitCredentials(): Promise<GitCredentials> {
    if (!this.config.gitCredentialsSecretArn) {
      throw new Error('Git credentials secret ARN not configured');
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: this.config.gitCredentialsSecretArn
      });

      const response = await this.secretsClient.send(command);
      
      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      const credentials = JSON.parse(response.SecretString);
      return {
        username: credentials.username,
        token: credentials.token
      };
    } catch (error) {
      logger.error('Failed to retrieve Git credentials', error);
      throw error;
    }
  }

  /**
   * Initialize Octokit with GitHub token from Secrets Manager
   */
  private async initializeOctokit(): Promise<void> {
    if (!this.config.githubTokenSecretArn) {
      throw new Error('GitHub token secret ARN not configured');
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: this.config.githubTokenSecretArn
      });

      const response = await this.secretsClient.send(command);
      
      if (!response.SecretString) {
        throw new Error('GitHub token secret is empty');
      }

      const { token } = JSON.parse(response.SecretString);
      
      this.octokit = new Octokit({ auth: token });
      
      logger.info('Octokit initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Octokit', error);
      throw error;
    }
  }
}
