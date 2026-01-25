/**
 * Unit tests for PullRequestUpdater
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PullRequestUpdaterImpl } from './pull-request-updater';
import type { PRDetails, PRContext, TestResult, CoverageResult, BuildMetadata } from '../types';
import { PRUpdateError } from '../errors';
import { Octokit } from '@octokit/rest';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Mock dependencies
vi.mock('@octokit/rest');
vi.mock('@aws-sdk/client-secrets-manager');
vi.mock('../utils/logger');

describe('PullRequestUpdaterImpl', () => {
  let updater: PullRequestUpdaterImpl;
  let mockOctokit: any;
  let mockSecretsClient: any;

  const config = {
    repoOwner: 'test-owner',
    repoName: 'test-repo',
    platform: 'github' as const,
    apiTokenSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-token',
    region: 'us-east-1'
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock Octokit
    mockOctokit = {
      pulls: {
        list: vi.fn(),
        update: vi.fn()
      }
    };
    vi.mocked(Octokit).mockImplementation(() => mockOctokit as any);

    // Mock SecretsManagerClient
    mockSecretsClient = {
      send: vi.fn()
    };
    vi.mocked(SecretsManagerClient).mockImplementation(() => mockSecretsClient as any);

    updater = new PullRequestUpdaterImpl(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided config', () => {
      expect(updater).toBeInstanceOf(PullRequestUpdaterImpl);
    });

    it('should use default region if not provided', () => {
      const configWithoutRegion = { ...config };
      delete (configWithoutRegion as any).region;
      const updaterWithoutRegion = new PullRequestUpdaterImpl(configWithoutRegion);
      expect(updaterWithoutRegion).toBeInstanceOf(PullRequestUpdaterImpl);
    });
  });

  describe('generatePRBody', () => {
    it('should generate PR body with all test results passed', () => {
      const context: PRContext = {
        taskId: 'task-123',
        testResult: {
          passed: true,
          totalTests: 10,
          passedTests: 10,
          failedTests: 0,
          output: 'All tests passed',
          failures: []
        },
        coverageResult: {
          percentage: 85.5,
          meetsThreshold: true,
          coverageByFile: new Map(),
          summary: 'Coverage summary',
          lines: 85.5,
          functions: 90.0,
          branches: 80.0,
          statements: 85.5
        },
        buildMetadata: {
          buildId: 'build-123',
          buildUrl: 'https://example.com/build/123',
          environment: 'test',
          timestamp: new Date('2026-01-25T10:00:00Z')
        }
      };

      const body = updater.generatePRBody(context);

      expect(body).toContain('## Kiro Worker Automated Changes');
      expect(body).toContain('**Spec Task**: task-123');
      expect(body).toContain('**Build ID**: build-123');
      expect(body).toContain('**Build URL**: https://example.com/build/123');
      expect(body).toContain('**Environment**: test');
      expect(body).toContain('**Total Tests**: 10');
      expect(body).toContain('**Passed**: 10 ✅');
      expect(body).toContain('**Failed**: 0');
      expect(body).toContain('**Overall Coverage**: 85.50% ✅');
      expect(body).toContain('**Lines**: 85.50%');
      expect(body).toContain('**Functions**: 90.00%');
      expect(body).toContain('**Branches**: 80.00%');
      expect(body).toContain('**Statements**: 85.50%');
      expect(body).toContain('Coverage summary');
    });

    it('should generate PR body with test failures', () => {
      const context: PRContext = {
        taskId: 'task-456',
        testResult: {
          passed: false,
          totalTests: 10,
          passedTests: 8,
          failedTests: 2,
          output: 'Some tests failed',
          failures: [
            {
              testName: 'should validate input',
              error: 'Expected true but got false',
              stackTrace: 'at test.ts:10:5'
            },
            {
              testName: 'should handle errors',
              error: 'Unexpected error thrown',
              stackTrace: 'at test.ts:20:5'
            }
          ]
        },
        coverageResult: {
          percentage: 75.0,
          meetsThreshold: false,
          coverageByFile: new Map(),
          summary: 'Coverage below threshold',
          lines: 75.0,
          functions: 70.0,
          branches: 65.0,
          statements: 75.0
        },
        buildMetadata: {
          buildId: 'build-456',
          buildUrl: 'https://example.com/build/456',
          environment: 'staging',
          timestamp: new Date('2026-01-25T11:00:00Z')
        }
      };

      const body = updater.generatePRBody(context);

      expect(body).toContain('**Failed**: 2 ❌');
      expect(body).toContain('❌ Tests failed');
      expect(body).toContain('**Overall Coverage**: 75.00% ⚠️');
      expect(body).toContain('### Failed Tests');
      expect(body).toContain('#### should validate input');
      expect(body).toContain('Expected true but got false');
      expect(body).toContain('#### should handle errors');
      expect(body).toContain('Unexpected error thrown');
    });

    it('should format coverage percentages to 2 decimal places', () => {
      const context: PRContext = {
        taskId: 'task-789',
        testResult: {
          passed: true,
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          output: '',
          failures: []
        },
        coverageResult: {
          percentage: 83.333333,
          meetsThreshold: true,
          coverageByFile: new Map(),
          summary: '',
          lines: 83.333333,
          functions: 85.666666,
          branches: 81.111111,
          statements: 83.333333
        },
        buildMetadata: {
          buildId: 'build-789',
          buildUrl: 'https://example.com/build/789',
          environment: 'production',
          timestamp: new Date('2026-01-25T12:00:00Z')
        }
      };

      const body = updater.generatePRBody(context);

      expect(body).toContain('**Overall Coverage**: 83.33%');
      expect(body).toContain('**Lines**: 83.33%');
      expect(body).toContain('**Functions**: 85.67%');
      expect(body).toContain('**Branches**: 81.11%');
      expect(body).toContain('**Statements**: 83.33%');
    });
  });

  describe('updatePR', () => {
    const prDetails: PRDetails = {
      sourceBranch: 'feature-branch',
      targetBranch: 'main',
      title: 'Test PR',
      body: 'Test PR body',
      metadata: {
        buildId: 'build-123',
        buildUrl: 'https://example.com/build/123',
        specTask: 'task-123',
        testSummary: 'All tests passed',
        coveragePercentage: 85.5,
        modifiedFiles: ['file1.ts', 'file2.ts']
      }
    };

    beforeEach(() => {
      // Mock successful secret retrieval
      mockSecretsClient.send.mockResolvedValue({
        SecretString: 'test-api-token'
      });
    });

    it('should successfully update GitHub PR', async () => {
      // Mock GitHub API responses
      mockOctokit.pulls.list.mockResolvedValue({
        data: [
          {
            number: 42,
            html_url: 'https://github.com/test-owner/test-repo/pull/42'
          }
        ]
      });
      mockOctokit.pulls.update.mockResolvedValue({});

      const result = await updater.updatePR(prDetails);

      expect(result.success).toBe(true);
      expect(result.prNumber).toBe(42);
      expect(result.prUrl).toBe('https://github.com/test-owner/test-repo/pull/42');

      expect(mockSecretsClient.send).toHaveBeenCalledWith(
        expect.any(GetSecretValueCommand)
      );
      expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        head: 'test-owner:feature-branch',
        state: 'open'
      });
      expect(mockOctokit.pulls.update).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        body: 'Test PR body'
      });
    });

    it('should cache API token after first retrieval', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [{ number: 42, html_url: 'https://github.com/test-owner/test-repo/pull/42' }]
      });
      mockOctokit.pulls.update.mockResolvedValue({});

      // First call
      await updater.updatePR(prDetails);
      expect(mockSecretsClient.send).toHaveBeenCalledTimes(1);

      // Second call should use cached token
      await updater.updatePR(prDetails);
      expect(mockSecretsClient.send).toHaveBeenCalledTimes(1);
    });

    it('should throw PRUpdateError when no open PR found', async () => {
      mockOctokit.pulls.list.mockResolvedValue({ data: [] });

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
      await expect(updater.updatePR(prDetails)).rejects.toThrow(
        'No open pull request found for branch: feature-branch'
      );
    });

    it('should throw PRUpdateError when secret retrieval fails', async () => {
      mockSecretsClient.send.mockRejectedValue(new Error('Secret not found'));

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
      await expect(updater.updatePR(prDetails)).rejects.toThrow(
        'Failed to retrieve API token'
      );
    });

    it('should throw PRUpdateError when secret value is empty', async () => {
      mockSecretsClient.send.mockResolvedValue({ SecretString: '' });

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
      await expect(updater.updatePR(prDetails)).rejects.toThrow(
        'Secret value is empty'
      );
    });

    it('should throw PRUpdateError when GitHub API fails', async () => {
      mockOctokit.pulls.list.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
      await expect(updater.updatePR(prDetails)).rejects.toThrow(
        'Failed to update pull request'
      );
    });

    it('should retry on transient failures', async () => {
      // First two attempts fail, third succeeds
      mockOctokit.pulls.list
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          data: [{ number: 42, html_url: 'https://github.com/test-owner/test-repo/pull/42' }]
        });
      mockOctokit.pulls.update.mockResolvedValue({});

      const result = await updater.updatePR(prDetails);

      expect(result.success).toBe(true);
      expect(mockOctokit.pulls.list).toHaveBeenCalledTimes(3);
    });

    it('should throw PRUpdateError after max retry attempts', async () => {
      mockOctokit.pulls.list.mockRejectedValue(new Error('Persistent error'));

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
      expect(mockOctokit.pulls.list).toHaveBeenCalledTimes(3);
    });

    it('should throw PRUpdateError for GitLab platform when no MR found', async () => {
      const gitlabUpdater = new PullRequestUpdaterImpl({
        ...config,
        platform: 'gitlab'
      });

      // Mock fetch for GitLab API - return empty array (no MRs found)
      global.fetch = vi.fn()
        .mockResolvedValue({
          ok: true,
          json: async () => []
        } as Response);

      await expect(gitlabUpdater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
      await expect(gitlabUpdater.updatePR(prDetails)).rejects.toThrow(
        'No open merge request found for branch: feature-branch'
      );
    });

    it('should successfully update GitLab MR', async () => {
      const gitlabUpdater = new PullRequestUpdaterImpl({
        ...config,
        platform: 'gitlab'
      });

      // Mock fetch for GitLab API
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              iid: 42,
              web_url: 'https://gitlab.com/test-owner/test-repo/-/merge_requests/42'
            }
          ]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        } as Response);

      const result = await gitlabUpdater.updatePR(prDetails);

      expect(result.success).toBe(true);
      expect(result.prNumber).toBe(42);
      expect(result.prUrl).toBe('https://gitlab.com/test-owner/test-repo/-/merge_requests/42');
    });

    it('should handle GitLab API errors', async () => {
      const gitlabUpdater = new PullRequestUpdaterImpl({
        ...config,
        platform: 'gitlab'
      });

      // Mock fetch to return error
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized'
        } as Response);

      await expect(gitlabUpdater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
    });
  });

  describe('error handling', () => {
    it('should handle non-Error exceptions in updatePR', async () => {
      mockSecretsClient.send.mockRejectedValue('String error');

      const prDetails: PRDetails = {
        sourceBranch: 'feature-branch',
        targetBranch: 'main',
        title: 'Test PR',
        body: 'Test PR body',
        metadata: {
          buildId: 'build-123',
          buildUrl: 'https://example.com/build/123',
          specTask: 'task-123',
          testSummary: 'All tests passed',
          coveragePercentage: 85.5,
          modifiedFiles: []
        }
      };

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
    });

    it('should handle non-Error exceptions in retrieveApiToken', async () => {
      mockSecretsClient.send.mockRejectedValue('String error');

      const prDetails: PRDetails = {
        sourceBranch: 'feature-branch',
        targetBranch: 'main',
        title: 'Test PR',
        body: 'Test PR body',
        metadata: {
          buildId: 'build-123',
          buildUrl: 'https://example.com/build/123',
          specTask: 'task-123',
          testSummary: 'All tests passed',
          coveragePercentage: 85.5,
          modifiedFiles: []
        }
      };

      await expect(updater.updatePR(prDetails)).rejects.toThrow(PRUpdateError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty test failures array', () => {
      const context: PRContext = {
        taskId: 'task-123',
        testResult: {
          passed: true,
          totalTests: 5,
          passedTests: 5,
          failedTests: 0,
          output: '',
          failures: []
        },
        coverageResult: {
          percentage: 85.0,
          meetsThreshold: true,
          coverageByFile: new Map(),
          summary: '',
          lines: 85.0,
          functions: 85.0,
          branches: 85.0,
          statements: 85.0
        },
        buildMetadata: {
          buildId: 'build-123',
          buildUrl: 'https://example.com/build/123',
          environment: 'test',
          timestamp: new Date('2026-01-25T10:00:00Z')
        }
      };

      const body = updater.generatePRBody(context);

      expect(body).not.toContain('### Failed Tests');
    });

    it('should handle zero coverage values', () => {
      const context: PRContext = {
        taskId: 'task-123',
        testResult: {
          passed: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          output: '',
          failures: []
        },
        coverageResult: {
          percentage: 0,
          meetsThreshold: false,
          coverageByFile: new Map(),
          summary: '',
          lines: 0,
          functions: 0,
          branches: 0,
          statements: 0
        },
        buildMetadata: {
          buildId: 'build-123',
          buildUrl: 'https://example.com/build/123',
          environment: 'test',
          timestamp: new Date('2026-01-25T10:00:00Z')
        }
      };

      const body = updater.generatePRBody(context);

      expect(body).toContain('**Overall Coverage**: 0.00% ⚠️');
      expect(body).toContain('**Total Tests**: 0');
    });
  });
});
