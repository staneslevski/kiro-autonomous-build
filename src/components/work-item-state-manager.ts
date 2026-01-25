/**
 * Work Item State Manager Component
 * 
 * Manages work item state transitions and DynamoDB locking for concurrency control.
 * Ensures only one work item is processed at a time using distributed locking.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { LockResult, WorkItem } from '../types';
import { LockAcquisitionError } from '../errors';
import { logger } from '../utils';

/**
 * Work lock record stored in DynamoDB
 */
export interface WorkLockRecord {
  readonly lockKey: string;           // PK: Always "work-item-processor-lock"
  readonly lockId: string;            // UUID for this lock acquisition
  readonly workItemId: string;        // GitHub work item ID
  readonly buildId: string;           // CodeBuild build ID
  readonly acquiredAt: number;        // Unix timestamp
  readonly expiresAt: number;         // Unix timestamp (TTL)
  readonly status: 'in_progress' | 'complete' | 'failed';
  readonly environment: string;       // test, staging, production
}

/**
 * Configuration for WorkItemStateManager
 */
export interface WorkItemStateManagerConfig {
  readonly tableName: string;
  readonly lockTTLHours?: number;     // Default: 2 hours
  readonly region?: string;
}

/**
 * WorkItemStateManager manages work item state and distributed locking
 */
export class WorkItemStateManager {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;
  private readonly lockTTLHours: number;
  private static readonly LOCK_KEY = 'work-item-processor-lock';

  constructor(config: WorkItemStateManagerConfig) {
    this.tableName = config.tableName;
    this.lockTTLHours = config.lockTTLHours ?? 2;
    this.client = new DynamoDBClient({ region: config.region });
  }

  /**
   * Attempts to acquire the work item processing lock
   * 
   * @param workItemId - The work item ID to lock
   * @param buildId - The CodeBuild build ID
   * @param environment - The environment (test, staging, production)
   * @returns LockResult indicating success or failure
   */
  async acquireWorkLock(
    workItemId: string,
    buildId: string,
    environment: string
  ): Promise<LockResult> {
    const lockId = this.generateLockId();
    const now = Date.now();
    const expiresAt = now + (this.lockTTLHours * 60 * 60 * 1000);

    const record: WorkLockRecord = {
      lockKey: WorkItemStateManager.LOCK_KEY,
      lockId,
      workItemId,
      buildId,
      acquiredAt: now,
      expiresAt,
      status: 'in_progress',
      environment,
    };

    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(record),
        ConditionExpression: 'attribute_not_exists(lockKey) OR expiresAt < :now',
        ExpressionAttributeValues: marshall({
          ':now': now,
        }),
      });

      await this.client.send(command);

      logger.info('Work lock acquired successfully', {
        lockId,
        workItemId,
        buildId,
        environment,
        expiresAt: new Date(expiresAt).toISOString(),
      });

      return {
        acquired: true,
        lockId,
        expiresAt: new Date(expiresAt),
      };
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        logger.info('Work lock already held by another process', {
          workItemId,
          buildId,
        });

        return {
          acquired: false,
          lockId: '',
          expiresAt: new Date(),
          reason: 'Lock already held by another process',
        };
      }

      logger.error('Failed to acquire work lock', {
        error: error instanceof Error ? error.message : String(error),
        workItemId,
        buildId,
      });

      throw new LockAcquisitionError(
        'Failed to acquire work lock',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Releases the work item processing lock
   * 
   * @param lockId - The lock ID to release
   */
  async releaseWorkLock(lockId: string): Promise<void> {
    try {
      const command = new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({
          lockKey: WorkItemStateManager.LOCK_KEY,
        }),
        ConditionExpression: 'lockId = :lockId',
        ExpressionAttributeValues: marshall({
          ':lockId': lockId,
        }),
      });

      await this.client.send(command);

      logger.info('Work lock released successfully', { lockId });
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        logger.warn('Lock release failed: lock ID mismatch or lock already released', {
          lockId,
        });
        // Don't throw - lock may have expired or been released already
        return;
      }

      logger.error('Failed to release work lock', {
        error: error instanceof Error ? error.message : String(error),
        lockId,
      });

      // Don't throw - lock will expire naturally
      // This prevents build failures due to cleanup issues
    }
  }

  /**
   * Marks a work item as in progress
   * 
   * @param workItemId - The work item ID
   * @param buildId - The CodeBuild build ID
   */
  async markWorkItemInProgress(workItemId: string, buildId: string): Promise<void> {
    logger.info('Marking work item as in progress', { workItemId, buildId });
    // State is already set to 'in_progress' when lock is acquired
    // This method is provided for explicit state management if needed
  }

  /**
   * Marks a work item as complete
   * 
   * @param workItemId - The work item ID
   */
  async markWorkItemComplete(workItemId: string): Promise<void> {
    logger.info('Marking work item as complete', { workItemId });
    // In current design, lock is released when work completes
    // Future enhancement: Update status field before releasing lock
  }

  /**
   * Marks a work item as failed
   * 
   * @param workItemId - The work item ID
   * @param error - The error message
   */
  async markWorkItemFailed(workItemId: string, error: string): Promise<void> {
    logger.error('Marking work item as failed', { workItemId, error });
    // In current design, lock is released when work fails
    // Future enhancement: Update status field before releasing lock
  }

  /**
   * Detects stale work items (locks that have expired but status is still in_progress)
   * 
   * @returns Array of stale work items
   */
  async detectStaleWorkItems(): Promise<WorkItem[]> {
    try {
      const now = Date.now();

      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'lockKey = :lockKey',
        FilterExpression: 'expiresAt < :now AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':lockKey': WorkItemStateManager.LOCK_KEY,
          ':now': now,
          ':status': 'in_progress',
        }),
      });

      const response = await this.client.send(command);

      if (!response.Items || response.Items.length === 0) {
        return [];
      }

      const staleItems: WorkItem[] = response.Items.map((item) => {
        const record = unmarshall(item) as WorkLockRecord;
        return {
          id: record.workItemId,
          title: 'Stale work item',
          description: `Build ${record.buildId} timed out or crashed`,
          branchName: '',
          status: 'failed',
          createdAt: new Date(record.acquiredAt),
        };
      });

      logger.warn('Detected stale work items', {
        count: staleItems.length,
        items: staleItems.map((item) => item.id),
      });

      return staleItems;
    } catch (error) {
      logger.error('Failed to detect stale work items', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new LockAcquisitionError(
        'Failed to detect stale work items',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generates a unique lock ID
   * 
   * @returns UUID string
   */
  private generateLockId(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
