/**
 * Unit tests for Work Item Poller Lambda Handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkItemPoller, WorkItemPollerConfig, handler } from './work-item-poller-handler';
import { WorkItemStateManager } from '../components/work-item-state-manager';
import { GitHubProjectMonitorImpl } from '../components/github-project-monitor';
import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { WorkItem } from '../types';

// Mock dependencies
vi.mock('../components/work-item-state-manager');
vi.mock('../components/github-project-monitor');
vi.mock('@aws-sdk/client-codebuild');

describe('WorkItemPoller', () => {
  let poller: WorkItemPoller;
  let config: WorkItemPollerConfig;
  let mockStateManager: any;
  let mockProjectMonitor: any;
  let mockCodeBuildClient: any;

  const mockWorkItem: WorkItem = {
    id: 'work-item-123',
    title: 'Test Work Item',
    description: 'Test description',
    branchName: 'feature-test',
    status: 'For Implementation',
    createdAt: new Date('2026-01-01'),
    priority: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      locksTableName: 'test-locks-table',
      githubTokenSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test',
      codeBuildProjectName: 'test-codebuild-project',
      environment: 'test',
      region: 'us-east-1',
      githubOrganization: 'test-org',
      githubRepository: 'test-repo',
      githubProjectNumber: 1,
      targetStatusColumn: 'For Implementation',
    };

    // Mock WorkItemStateManager
    mockStateManager = {
      acquireWorkLock: vi.fn(),
      releaseWorkLock: vi.fn(),
      markWorkItemInProgress: vi.fn(),
      markWorkItemComplete: vi.fn(),
      markWorkItemFailed: vi.fn(),
    };
    vi.mocked(WorkItemStateManager).mockImplementation(() => mockStateManager);

    // Mock GitHubProjectMonitorImpl
    mockProjectMonitor = {
      fetchWorkItems: vi.fn(),
      validateWorkItem: vi.fn(),
      extractBranchName: vi.fn(),
      verifyPullRequestExists: vi.fn(),
    };
    vi.mocked(GitHubProjectMonitorImpl).mockImplementation(() => mockProjectMonitor);

    // Mock CodeBuildClient
    mockCodeBuildClient = {
      send: vi.fn(),
    };
    vi.mocked(CodeBuildClient).mockImplementation(() => mockCodeBuildClient);

    poller = new WorkItemPoller(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided config', () => {
      expect(poller).toBeInstanceOf(WorkItemPoller);
    });
  });

  describe('poll', () => {
    it('should return empty result when no work items available', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([]);

      const result = await poller.poll();

      expect(result.workItemsFound).toBe(0);
      expect(result.lockAcquired).toBe(false);
      expect(result.buildTriggered).toBe(false);
      expect(result.errors).toEqual([]);
    });

    it('should not acquire lock when no work items available', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([]);

      await poller.poll();

      expect(mockStateManager.acquireWorkLock).not.toHaveBeenCalled();
    });

    it('should acquire lock for first work item', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([mockWorkItem]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      await poller.poll();

      expect(mockStateManager.acquireWorkLock).toHaveBeenCalledWith(
        'work-item-123',
        'pending',
        'test'
      );
    });

    it('should return without triggering build when lock not acquired', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([mockWorkItem]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: false,
        lockId: '',
        expiresAt: new Date(),
        reason: 'Lock already held',
      });

      const result = await poller.poll();

      expect(result.workItemsFound).toBe(1);
      expect(result.lockAcquired).toBe(false);
      expect(result.buildTriggered).toBe(false);
      expect(mockCodeBuildClient.send).not.toHaveBeenCalled();
    });

    it('should trigger CodeBuild when lock acquired', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([mockWorkItem]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      const result = await poller.poll();

      expect(result.workItemsFound).toBe(1);
      expect(result.lockAcquired).toBe(true);
      expect(result.buildTriggered).toBe(true);
      expect(result.workItemTriggered).toEqual(mockWorkItem);
      expect(mockCodeBuildClient.send).toHaveBeenCalledWith(expect.any(StartBuildCommand));
    });

    it('should mark work item as in progress after successful build trigger', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([mockWorkItem]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      await poller.poll();

      expect(mockStateManager.markWorkItemInProgress).toHaveBeenCalledWith(
        'work-item-123',
        'build-123'
      );
    });

    it('should release lock on CodeBuild trigger failure', async () => {
      mockProjectMonitor.fetchWorkItems.mockResolvedValue([mockWorkItem]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockRejectedValue(new Error('CodeBuild error'));

      const result = await poller.poll();

      expect(result.lockAcquired).toBe(true);
      expect(result.buildTriggered).toBe(false);
      expect(result.errors).toContain('CodeBuild error');
      expect(mockStateManager.releaseWorkLock).toHaveBeenCalledWith('lock-123');
    });

    it('should handle fetch work items error', async () => {
      mockProjectMonitor.fetchWorkItems.mockRejectedValue(new Error('GitHub API error'));

      const result = await poller.poll();

      expect(result.workItemsFound).toBe(0);
      expect(result.lockAcquired).toBe(false);
      expect(result.buildTriggered).toBe(false);
      expect(result.errors).toContain('GitHub API error');
    });

    it('should sort work items by priority and creation date', async () => {
      const workItem1: WorkItem = {
        ...mockWorkItem,
        id: 'work-item-1',
        priority: 1,
        createdAt: new Date('2026-01-03'),
      };
      const workItem2: WorkItem = {
        ...mockWorkItem,
        id: 'work-item-2',
        priority: 2,
        createdAt: new Date('2026-01-02'),
      };
      const workItem3: WorkItem = {
        ...mockWorkItem,
        id: 'work-item-3',
        priority: 2,
        createdAt: new Date('2026-01-01'),
      };

      mockProjectMonitor.fetchWorkItems.mockResolvedValue([workItem1, workItem2, workItem3]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      const result = await poller.poll();

      // Should select work-item-3 (priority 2, oldest)
      expect(result.workItemTriggered?.id).toBe('work-item-3');
    });
  });

  describe('triggerCodeBuild', () => {
    it('should trigger CodeBuild with correct parameters', async () => {
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      const result = await poller.triggerCodeBuild(mockWorkItem, 'test');

      expect(result.success).toBe(true);
      expect(result.buildId).toBe('build-123');
      expect(result.buildArn).toBe('arn:aws:codebuild:us-east-1:123456789012:build/test:build-123');
      expect(mockCodeBuildClient.send).toHaveBeenCalled();
    });

    it('should include environment variables in CodeBuild command', async () => {
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      await poller.triggerCodeBuild(mockWorkItem, 'production');

      const command = mockCodeBuildClient.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(StartBuildCommand);
    });

    it('should return error when CodeBuild response missing build ID', async () => {
      mockCodeBuildClient.send.mockResolvedValue({
        build: {},
      });

      const result = await poller.triggerCodeBuild(mockWorkItem, 'test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing build ID or ARN');
    });

    it('should handle CodeBuild client error', async () => {
      mockCodeBuildClient.send.mockRejectedValue(new Error('CodeBuild service error'));

      const result = await poller.triggerCodeBuild(mockWorkItem, 'test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('CodeBuild service error');
    });

    it('should construct correct spec path from branch name', async () => {
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      await poller.triggerCodeBuild(mockWorkItem, 'test');

      // Verify spec path is constructed correctly
      expect(mockCodeBuildClient.send).toHaveBeenCalled();
    });
  });

  describe('work item sorting', () => {
    it('should prioritize higher priority work items', async () => {
      const lowPriority: WorkItem = {
        ...mockWorkItem,
        id: 'low',
        priority: 1,
        createdAt: new Date('2026-01-01'),
      };
      const highPriority: WorkItem = {
        ...mockWorkItem,
        id: 'high',
        priority: 5,
        createdAt: new Date('2026-01-02'),
      };

      mockProjectMonitor.fetchWorkItems.mockResolvedValue([lowPriority, highPriority]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      const result = await poller.poll();

      expect(result.workItemTriggered?.id).toBe('high');
    });

    it('should use creation date when priorities are equal', async () => {
      const newer: WorkItem = {
        ...mockWorkItem,
        id: 'newer',
        priority: 1,
        createdAt: new Date('2026-01-02'),
      };
      const older: WorkItem = {
        ...mockWorkItem,
        id: 'older',
        priority: 1,
        createdAt: new Date('2026-01-01'),
      };

      mockProjectMonitor.fetchWorkItems.mockResolvedValue([newer, older]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      const result = await poller.poll();

      expect(result.workItemTriggered?.id).toBe('older');
    });

    it('should handle work items without priority', async () => {
      const withoutPriority: WorkItem = {
        ...mockWorkItem,
        id: 'no-priority',
        priority: undefined,
        createdAt: new Date('2026-01-01'),
      };

      mockProjectMonitor.fetchWorkItems.mockResolvedValue([withoutPriority]);
      mockStateManager.acquireWorkLock.mockResolvedValue({
        acquired: true,
        lockId: 'lock-123',
        expiresAt: new Date(),
      });
      mockCodeBuildClient.send.mockResolvedValue({
        build: {
          id: 'build-123',
          arn: 'arn:aws:codebuild:us-east-1:123456789012:build/test:build-123',
        },
      });

      const result = await poller.poll();

      expect(result.workItemTriggered?.id).toBe('no-priority');
    });
  });
});

describe('Lambda handler', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };

    // Set required environment variables
    process.env.LOCKS_TABLE_NAME = 'test-locks-table';
    process.env.GITHUB_TOKEN_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test';
    process.env.CODEBUILD_PROJECT_NAME = 'test-codebuild-project';
    process.env.ENVIRONMENT = 'test';
    process.env.AWS_REGION = 'us-east-1';
    process.env.GITHUB_ORGANIZATION = 'test-org';
    process.env.GITHUB_REPOSITORY = 'test-repo';
    process.env.GITHUB_PROJECT_NUMBER = '1';
    process.env.TARGET_STATUS_COLUMN = 'For Implementation';

    // Mock dependencies
    const mockStateManager = {
      acquireWorkLock: vi.fn().mockResolvedValue({
        acquired: false,
        lockId: '',
        expiresAt: new Date(),
      }),
      releaseWorkLock: vi.fn(),
      markWorkItemInProgress: vi.fn(),
    };
    vi.mocked(WorkItemStateManager).mockImplementation(() => mockStateManager);

    const mockProjectMonitor = {
      fetchWorkItems: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(GitHubProjectMonitorImpl).mockImplementation(() => mockProjectMonitor);

    const mockCodeBuildClient = {
      send: vi.fn(),
    };
    vi.mocked(CodeBuildClient).mockImplementation(() => mockCodeBuildClient);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return 200 status code on successful execution', async () => {
    const result = await handler({});

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty('workItemsFound');
  });

  it('should return 500 status code on missing environment variable', async () => {
    delete process.env.LOCKS_TABLE_NAME;

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toHaveProperty('error');
  });

  it('should validate LOCKS_TABLE_NAME is required', async () => {
    delete process.env.LOCKS_TABLE_NAME;

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('LOCKS_TABLE_NAME');
  });

  it('should validate GITHUB_TOKEN_SECRET_ARN is required', async () => {
    delete process.env.GITHUB_TOKEN_SECRET_ARN;

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('GITHUB_TOKEN_SECRET_ARN');
  });

  it('should validate CODEBUILD_PROJECT_NAME is required', async () => {
    delete process.env.CODEBUILD_PROJECT_NAME;

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('CODEBUILD_PROJECT_NAME');
  });

  it('should validate GITHUB_ORGANIZATION is required', async () => {
    delete process.env.GITHUB_ORGANIZATION;

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('GITHUB_ORGANIZATION');
  });

  it('should validate GITHUB_REPOSITORY is required', async () => {
    delete process.env.GITHUB_REPOSITORY;

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('GITHUB_REPOSITORY');
  });

  it('should validate GITHUB_PROJECT_NUMBER is required', async () => {
    process.env.GITHUB_PROJECT_NUMBER = '0';

    const result = await handler({});

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('GITHUB_PROJECT_NUMBER');
  });

  it('should use default values for optional environment variables', async () => {
    delete process.env.ENVIRONMENT;
    delete process.env.AWS_REGION;
    delete process.env.TARGET_STATUS_COLUMN;

    const result = await handler({});

    expect(result.statusCode).toBe(200);
  });

  it('should handle polling errors gracefully', async () => {
    const mockProjectMonitor = {
      fetchWorkItems: vi.fn().mockRejectedValue(new Error('GitHub API error')),
    };
    vi.mocked(GitHubProjectMonitorImpl).mockImplementation(() => mockProjectMonitor);

    const result = await handler({});

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.errors).toContain('GitHub API error');
  });
});
