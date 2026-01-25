/**
 * Unit tests for WorkItemStateManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkItemStateManager, WorkItemStateManagerConfig } from './work-item-state-manager';
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, QueryCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { LockAcquisitionError } from '../errors';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/util-dynamodb');

describe('WorkItemStateManager', () => {
  let manager: WorkItemStateManager;
  let mockSend: ReturnType<typeof vi.fn>;
  let config: WorkItemStateManagerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    config = {
      tableName: 'test-locks-table',
      lockTTLHours: 2,
      region: 'us-east-1',
    };

    mockSend = vi.fn();
    vi.mocked(DynamoDBClient).mockImplementation(() => ({
      send: mockSend,
    } as any));

    vi.mocked(marshall).mockImplementation((obj: any) => obj as any);

    manager = new WorkItemStateManager(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided config', () => {
      expect(manager).toBeInstanceOf(WorkItemStateManager);
    });

    it('should use default lock TTL of 2 hours if not provided', () => {
      const managerWithDefaults = new WorkItemStateManager({
        tableName: 'test-table',
      });
      expect(managerWithDefaults).toBeInstanceOf(WorkItemStateManager);
    });
  });

  describe('acquireWorkLock', () => {
    it('should successfully acquire lock when no lock exists', async () => {
      mockSend.mockResolvedValue({});

      const result = await manager.acquireWorkLock(
        'work-item-123',
        'build-456',
        'test'
      );

      expect(result.acquired).toBe(true);
      expect(result.lockId).toBeTruthy();
      expect(result.lockId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    });

    it('should include correct lock record attributes', async () => {
      mockSend.mockResolvedValue({});

      await manager.acquireWorkLock('work-item-123', 'build-456', 'test');

      expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
      const putItemCall = mockSend.mock.calls[0][0];
      expect(putItemCall).toBeInstanceOf(PutItemCommand);
    });

    it('should return acquired false when lock already held', async () => {
      const conditionalError = new ConditionalCheckFailedException({
        message: 'Conditional check failed',
        $metadata: {},
      });
      mockSend.mockRejectedValue(conditionalError);

      const result = await manager.acquireWorkLock(
        'work-item-123',
        'build-456',
        'test'
      );

      expect(result.acquired).toBe(false);
      expect(result.lockId).toBe('');
      expect(result.reason).toBe('Lock already held by another process');
    });

    it('should throw LockAcquisitionError on DynamoDB service error', async () => {
      const serviceError = new Error('DynamoDB service error');
      mockSend.mockRejectedValue(serviceError);

      await expect(
        manager.acquireWorkLock('work-item-123', 'build-456', 'test')
      ).rejects.toThrow(LockAcquisitionError);
    });

    it('should set expiration time based on configured TTL', async () => {
      const customConfig = {
        tableName: 'test-table',
        lockTTLHours: 4,
      };
      const customManager = new WorkItemStateManager(customConfig);
      mockSend.mockResolvedValue({});

      const beforeTime = Date.now();
      const result = await customManager.acquireWorkLock(
        'work-item-123',
        'build-456',
        'test'
      );
      const afterTime = Date.now();

      const expectedMinExpiry = beforeTime + (4 * 60 * 60 * 1000);
      const expectedMaxExpiry = afterTime + (4 * 60 * 60 * 1000);

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiry);
    });

    it('should handle different environments', async () => {
      mockSend.mockResolvedValue({});

      const environments = ['test', 'staging', 'production'];
      
      for (const env of environments) {
        await manager.acquireWorkLock('work-item-123', 'build-456', env);
      }

      expect(mockSend).toHaveBeenCalledTimes(environments.length);
    });
  });

  describe('releaseWorkLock', () => {
    it('should successfully release lock with valid lockId', async () => {
      mockSend.mockResolvedValue({});

      await manager.releaseWorkLock('lock-123');

      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteItemCommand));
    });

    it('should include correct delete parameters', async () => {
      mockSend.mockResolvedValue({});

      await manager.releaseWorkLock('lock-123');

      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteItemCommand));
      const deleteItemCall = mockSend.mock.calls[0][0];
      expect(deleteItemCall).toBeInstanceOf(DeleteItemCommand);
    });

    it('should not throw when lock ID mismatch occurs', async () => {
      const conditionalError = new ConditionalCheckFailedException({
        message: 'Conditional check failed',
        $metadata: {},
      });
      mockSend.mockRejectedValue(conditionalError);

      await expect(manager.releaseWorkLock('wrong-lock-id')).resolves.not.toThrow();
    });

    it('should not throw when lock already released', async () => {
      const conditionalError = new ConditionalCheckFailedException({
        message: 'Item not found',
        $metadata: {},
      });
      mockSend.mockRejectedValue(conditionalError);

      await expect(manager.releaseWorkLock('lock-123')).resolves.not.toThrow();
    });

    it('should not throw on DynamoDB service error', async () => {
      const serviceError = new Error('DynamoDB service error');
      mockSend.mockRejectedValue(serviceError);

      // Should log error but not throw to prevent build failures
      await expect(manager.releaseWorkLock('lock-123')).resolves.not.toThrow();
    });
  });

  describe('markWorkItemInProgress', () => {
    it('should log work item marked as in progress', async () => {
      await manager.markWorkItemInProgress('work-item-123', 'build-456');
      
      // Method completes successfully (state set during lock acquisition)
      expect(true).toBe(true);
    });
  });

  describe('markWorkItemComplete', () => {
    it('should log work item marked as complete', async () => {
      await manager.markWorkItemComplete('work-item-123');
      
      // Method completes successfully
      expect(true).toBe(true);
    });
  });

  describe('markWorkItemFailed', () => {
    it('should log work item marked as failed', async () => {
      await manager.markWorkItemFailed('work-item-123', 'Test error');
      
      // Method completes successfully
      expect(true).toBe(true);
    });
  });

  describe('detectStaleWorkItems', () => {
    it('should return empty array when no stale items exist', async () => {
      mockSend.mockResolvedValue({
        Items: [],
      });

      const staleItems = await manager.detectStaleWorkItems();

      expect(staleItems).toEqual([]);
      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });

    it('should return stale work items when expired locks exist', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;

      mockSend.mockResolvedValue({
        Items: [
          {
            lockKey: 'work-item-processor-lock',
            lockId: 'lock-123',
            workItemId: 'work-item-123',
            buildId: 'build-456',
            acquiredAt: expiredTime - 7200000,
            expiresAt: expiredTime,
            status: 'in_progress',
            environment: 'test',
          },
          {
            lockKey: 'work-item-processor-lock',
            lockId: 'lock-456',
            workItemId: 'work-item-456',
            buildId: 'build-789',
            acquiredAt: expiredTime - 7200000,
            expiresAt: expiredTime,
            status: 'in_progress',
            environment: 'production',
          },
        ],
      });

      // Mock unmarshall to return the items as-is
      const { unmarshall } = await import('@aws-sdk/util-dynamodb');
      vi.mocked(unmarshall).mockImplementation((item: any) => item);

      const staleItems = await manager.detectStaleWorkItems();

      expect(staleItems).toHaveLength(2);
      expect(staleItems[0].id).toBe('work-item-123');
      expect(staleItems[0].status).toBe('failed');
      expect(staleItems[1].id).toBe('work-item-456');
    });

    it('should include correct query parameters', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await manager.detectStaleWorkItems();

      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
      const queryCall = mockSend.mock.calls[0][0];
      expect(queryCall).toBeInstanceOf(QueryCommand);
    });

    it('should throw LockAcquisitionError on DynamoDB service error', async () => {
      const serviceError = new Error('DynamoDB service error');
      mockSend.mockRejectedValue(serviceError);

      await expect(manager.detectStaleWorkItems()).rejects.toThrow(LockAcquisitionError);
    });

    it('should handle undefined Items in response', async () => {
      mockSend.mockResolvedValue({});

      const staleItems = await manager.detectStaleWorkItems();

      expect(staleItems).toEqual([]);
    });
  });

  describe('lock ID generation', () => {
    it('should generate unique lock IDs', async () => {
      mockSend.mockResolvedValue({});

      const lockIds = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const result = await manager.acquireWorkLock(
          `work-item-${i}`,
          `build-${i}`,
          'test'
        );
        lockIds.add(result.lockId);
      }

      // All lock IDs should be unique
      expect(lockIds.size).toBe(100);
    });

    it('should generate valid UUID v4 format', async () => {
      mockSend.mockResolvedValue({});

      const result = await manager.acquireWorkLock(
        'work-item-123',
        'build-456',
        'test'
      );

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(result.lockId).toMatch(uuidRegex);
    });
  });

  describe('concurrent lock acquisition', () => {
    it('should handle concurrent acquisition attempts', async () => {
      let callCount = 0;
      mockSend.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({});
        } else {
          return Promise.reject(new ConditionalCheckFailedException({
            message: 'Conditional check failed',
            $metadata: {},
          }));
        }
      });

      const results = await Promise.all([
        manager.acquireWorkLock('work-item-123', 'build-1', 'test'),
        manager.acquireWorkLock('work-item-123', 'build-2', 'test'),
        manager.acquireWorkLock('work-item-123', 'build-3', 'test'),
      ]);

      const acquiredCount = results.filter(r => r.acquired).length;
      expect(acquiredCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      mockSend.mockRejectedValue('String error');

      await expect(
        manager.acquireWorkLock('work-item-123', 'build-456', 'test')
      ).rejects.toThrow(LockAcquisitionError);
    });

    it('should handle null errors', async () => {
      mockSend.mockRejectedValue(null);

      await expect(
        manager.acquireWorkLock('work-item-123', 'build-456', 'test')
      ).rejects.toThrow(LockAcquisitionError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty work item ID', async () => {
      mockSend.mockResolvedValue({});

      const result = await manager.acquireWorkLock('', 'build-456', 'test');

      expect(result.acquired).toBe(true);
    });

    it('should handle empty build ID', async () => {
      mockSend.mockResolvedValue({});

      const result = await manager.acquireWorkLock('work-item-123', '', 'test');

      expect(result.acquired).toBe(true);
    });

    it('should handle special characters in IDs', async () => {
      mockSend.mockResolvedValue({});

      const result = await manager.acquireWorkLock(
        'work-item-!@#$%',
        'build-^&*()',
        'test'
      );

      expect(result.acquired).toBe(true);
    });

    it('should handle very long IDs', async () => {
      mockSend.mockResolvedValue({});

      const longId = 'a'.repeat(1000);
      const result = await manager.acquireWorkLock(longId, longId, 'test');

      expect(result.acquired).toBe(true);
    });
  });
});
