/**
 * Work Item Poller Lambda Handler
 * 
 * Scheduled Lambda function that polls GitHub Projects for work items
 * and triggers CodeBuild executions with distributed locking.
 */

import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { GitHubProjectMonitorImpl } from '../components/github-project-monitor';
import { WorkItemStateManager } from '../components/work-item-state-manager';
import { WorkItem } from '../types';
import { logger } from '../utils';

/**
 * Configuration for Work Item Poller
 */
export interface WorkItemPollerConfig {
  readonly locksTableName: string;
  readonly githubTokenSecretArn: string;
  readonly codeBuildProjectName: string;
  readonly environment: string;
  readonly region?: string;
  readonly githubOrganization: string;
  readonly githubRepository: string;
  readonly githubProjectNumber: number;
  readonly targetStatusColumn: string;
}

/**
 * Result of polling operation
 */
export interface PollResult {
  readonly workItemsFound: number;
  readonly workItemTriggered?: WorkItem;
  readonly lockAcquired: boolean;
  readonly buildTriggered: boolean;
  readonly errors: string[];
}

/**
 * Result of CodeBuild trigger
 */
export interface BuildResult {
  readonly buildId: string;
  readonly buildArn: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Work Item Poller class
 */
export class WorkItemPoller {
  private readonly stateManager: WorkItemStateManager;
  private readonly projectMonitor: GitHubProjectMonitorImpl;
  private readonly codeBuildClient: CodeBuildClient;
  private readonly config: WorkItemPollerConfig;

  constructor(config: WorkItemPollerConfig) {
    this.config = config;
    
    this.stateManager = new WorkItemStateManager({
      tableName: config.locksTableName,
      region: config.region,
    });

    this.projectMonitor = new GitHubProjectMonitorImpl({
      apiTokenSecretArn: config.githubTokenSecretArn,
      region: config.region,
      repoOwner: config.githubOrganization,
      repoName: config.githubRepository,
    });

    this.codeBuildClient = new CodeBuildClient({ region: config.region });
  }

  /**
   * Main polling function
   * 
   * @returns PollResult with details of the polling operation
   */
  async poll(): Promise<PollResult> {
    const errors: string[] = [];

    try {
      logger.info('Starting work item polling', {
        environment: this.config.environment,
      });

      // Fetch work items from GitHub Projects
      const workItems = await this.projectMonitor.fetchWorkItems({
        organization: this.config.githubOrganization,
        repository: this.config.githubRepository,
        projectNumber: this.config.githubProjectNumber,
        targetStatusColumn: this.config.targetStatusColumn,
      });

      logger.info('Work items fetched', {
        count: workItems.length,
      });

      if (workItems.length === 0) {
        logger.info('No work items available');
        return {
          workItemsFound: 0,
          lockAcquired: false,
          buildTriggered: false,
          errors: [],
        };
      }

      // Sort by creation date (oldest first) or priority
      const sortedWorkItems = this.sortWorkItems(workItems);
      const selectedWorkItem = sortedWorkItems[0];

      logger.info('Selected work item for processing', {
        workItemId: selectedWorkItem.id,
        title: selectedWorkItem.title,
        branchName: selectedWorkItem.branchName,
      });

      // Attempt to acquire lock
      const lockResult = await this.stateManager.acquireWorkLock(
        selectedWorkItem.id,
        'pending', // Build ID not yet available
        this.config.environment
      );

      if (!lockResult.acquired) {
        logger.info('Lock not acquired, another process is working', {
          reason: lockResult.reason,
        });
        return {
          workItemsFound: workItems.length,
          lockAcquired: false,
          buildTriggered: false,
          errors: [],
        };
      }

      logger.info('Lock acquired successfully', {
        lockId: lockResult.lockId,
        expiresAt: lockResult.expiresAt.toISOString(),
      });

      // Trigger CodeBuild
      try {
        const buildResult = await this.triggerCodeBuild(
          selectedWorkItem,
          this.config.environment
        );

        if (!buildResult.success) {
          errors.push(buildResult.error || 'Unknown CodeBuild trigger error');
          // Release lock on failure
          await this.stateManager.releaseWorkLock(lockResult.lockId);
          
          return {
            workItemsFound: workItems.length,
            workItemTriggered: selectedWorkItem,
            lockAcquired: true,
            buildTriggered: false,
            errors,
          };
        }

        logger.info('CodeBuild triggered successfully', {
          buildId: buildResult.buildId,
          buildArn: buildResult.buildArn,
        });

        // Mark work item as in progress
        await this.stateManager.markWorkItemInProgress(
          selectedWorkItem.id,
          buildResult.buildId
        );

        return {
          workItemsFound: workItems.length,
          workItemTriggered: selectedWorkItem,
          lockAcquired: true,
          buildTriggered: true,
          errors: [],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);
        
        logger.error('Failed to trigger CodeBuild', {
          error: errorMessage,
          workItemId: selectedWorkItem.id,
        });

        // Release lock on error
        await this.stateManager.releaseWorkLock(lockResult.lockId);

        return {
          workItemsFound: workItems.length,
          workItemTriggered: selectedWorkItem,
          lockAcquired: true,
          buildTriggered: false,
          errors,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      
      logger.error('Polling failed', {
        error: errorMessage,
      });

      return {
        workItemsFound: 0,
        lockAcquired: false,
        buildTriggered: false,
        errors,
      };
    }
  }

  /**
   * Triggers a CodeBuild execution
   * 
   * @param workItem - The work item to process
   * @param environment - The environment (test, staging, production)
   * @returns BuildResult with build details
   */
  async triggerCodeBuild(
    workItem: WorkItem,
    environment: string
  ): Promise<BuildResult> {
    try {
      const specPath = `.kiro/specs/${workItem.branchName}`;

      const command = new StartBuildCommand({
        projectName: this.config.codeBuildProjectName,
        environmentVariablesOverride: [
          {
            name: 'BRANCH_NAME',
            value: workItem.branchName,
            type: 'PLAINTEXT',
          },
          {
            name: 'SPEC_PATH',
            value: specPath,
            type: 'PLAINTEXT',
          },
          {
            name: 'ENVIRONMENT',
            value: environment,
            type: 'PLAINTEXT',
          },
          {
            name: 'WORK_ITEM_ID',
            value: workItem.id,
            type: 'PLAINTEXT',
          },
        ],
      });

      const response = await this.codeBuildClient.send(command);

      if (!response.build?.id || !response.build?.arn) {
        return {
          buildId: '',
          buildArn: '',
          success: false,
          error: 'CodeBuild response missing build ID or ARN',
        };
      }

      return {
        buildId: response.build.id,
        buildArn: response.build.arn,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('CodeBuild trigger failed', {
        error: errorMessage,
        workItemId: workItem.id,
      });

      return {
        buildId: '',
        buildArn: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Sorts work items by priority and creation date
   * 
   * @param workItems - Array of work items to sort
   * @returns Sorted array (highest priority first, then oldest first)
   */
  private sortWorkItems(workItems: WorkItem[]): WorkItem[] {
    return [...workItems].sort((a, b) => {
      // Sort by priority first (if available)
      if (a.priority !== undefined && b.priority !== undefined) {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
      }

      // Then by creation date (oldest first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }
}

/**
 * Lambda handler function
 * 
 * @param event - Lambda event (EventBridge scheduled event)
 * @returns Response with polling results
 */
export async function handler(event: any): Promise<any> {
  logger.info('Work Item Poller Lambda invoked', {
    event: JSON.stringify(event),
  });

  try {
    // Load configuration from environment variables
    const config: WorkItemPollerConfig = {
      locksTableName: process.env.LOCKS_TABLE_NAME || '',
      githubTokenSecretArn: process.env.GITHUB_TOKEN_SECRET_ARN || '',
      codeBuildProjectName: process.env.CODEBUILD_PROJECT_NAME || '',
      environment: process.env.ENVIRONMENT || 'test',
      region: process.env.AWS_REGION || 'us-east-1',
      githubOrganization: process.env.GITHUB_ORGANIZATION || '',
      githubRepository: process.env.GITHUB_REPOSITORY || '',
      githubProjectNumber: parseInt(process.env.GITHUB_PROJECT_NUMBER || '0', 10),
      targetStatusColumn: process.env.TARGET_STATUS_COLUMN || 'For Implementation',
    };

    // Validate configuration
    if (!config.locksTableName) {
      throw new Error('LOCKS_TABLE_NAME environment variable is required');
    }
    if (!config.githubTokenSecretArn) {
      throw new Error('GITHUB_TOKEN_SECRET_ARN environment variable is required');
    }
    if (!config.codeBuildProjectName) {
      throw new Error('CODEBUILD_PROJECT_NAME environment variable is required');
    }
    if (!config.githubOrganization) {
      throw new Error('GITHUB_ORGANIZATION environment variable is required');
    }
    if (!config.githubRepository) {
      throw new Error('GITHUB_REPOSITORY environment variable is required');
    }
    if (config.githubProjectNumber === 0) {
      throw new Error('GITHUB_PROJECT_NUMBER environment variable is required');
    }

    const poller = new WorkItemPoller(config);
    const result = await poller.poll();

    logger.info('Polling completed', {
      workItemsFound: result.workItemsFound,
      lockAcquired: result.lockAcquired,
      buildTriggered: result.buildTriggered,
      errors: result.errors,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Lambda handler failed', {
      error: errorMessage,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: errorMessage,
      }),
    };
  }
}
