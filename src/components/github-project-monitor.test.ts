/**
 * Unit tests for GitHubProjectMonitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubProjectMonitorImpl } from './github-project-monitor';
import type { ProjectConfig, WorkItem } from '../types';
import { WorkItemError } from '../errors';
import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Mock dependencies
vi.mock('@octokit/graphql');
vi.mock('@octokit/rest');
vi.mock('@aws-sdk/client-secrets-manager');
vi.mock('../utils/logger');

describe('GitHubProjectMonitorImpl', () => {
  let monitor: GitHubProjectMonitorImpl;
  let mockOctokit: any;
  let mockGraphql: any;
  let mockSecretsClient: any;

  const config = {
    apiTokenSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:github-token',
    region: 'us-east-1',
    repoOwner: 'test-owner',
    repoName: 'test-repo'
  };

  const projectConfig: ProjectConfig = {
    organization: 'test-org',
    repository: 'test-repo',
    projectNumber: 1,
    targetStatusColumn: 'For Implementation'
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock Octokit
    mockOctokit = {
      repos: {
        getBranch: vi.fn(),
        getContent: vi.fn()
      },
      pulls: {
        list: vi.fn()
      }
    };
    vi.mocked(Octokit).mockImplementation(() => mockOctokit as any);

    // Mock graphql
    mockGraphql = vi.fn();
    vi.mocked(graphql).mockReturnValue(mockGraphql as any);
    vi.mocked(graphql.defaults).mockReturnValue(mockGraphql as any);

    // Mock SecretsManagerClient
    mockSecretsClient = {
      send: vi.fn().mockResolvedValue({
        SecretString: 'test-github-token'
      })
    };
    vi.mocked(SecretsManagerClient).mockImplementation(() => mockSecretsClient as any);

    monitor = new GitHubProjectMonitorImpl(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided config', () => {
      expect(monitor).toBeInstanceOf(GitHubProjectMonitorImpl);
    });

    it('should use default region if not provided', () => {
      const configWithoutRegion = { ...config };
      delete (configWithoutRegion as any).region;
      const monitorWithoutRegion = new GitHubProjectMonitorImpl(configWithoutRegion);
      expect(monitorWithoutRegion).toBeInstanceOf(GitHubProjectMonitorImpl);
    });
  });

  describe('fetchWorkItems', () => {
    it('should fetch work items successfully', async () => {
      const mockResponse = {
        organization: {
          projectV2: {
            items: {
              nodes: [
                {
                  id: 'item-1',
                  fieldValues: {
                    nodes: [
                      {
                        field: { name: 'Status' },
                        name: 'For Implementation'
                      },
                      {
                        field: { name: 'Branch' },
                        text: 'feature-branch-1'
                      }
                    ]
                  },
                  content: {
                    title: 'Implement feature X',
                    body: 'Description of feature X',
                    createdAt: '2026-01-25T10:00:00Z'
                  }
                },
                {
                  id: 'item-2',
                  fieldValues: {
                    nodes: [
                      {
                        field: { name: 'Status' },
                        name: 'For Implementation'
                      },
                      {
                        field: { name: 'Branch' },
                        text: 'feature-branch-2'
                      }
                    ]
                  },
                  content: {
                    title: 'Fix bug Y',
                    body: 'Description of bug Y',
                    createdAt: '2026-01-25T11:00:00Z'
                  }
                }
              ]
            }
          }
        }
      };

      mockGraphql.mockResolvedValue(mockResponse);

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(2);
      expect(workItems[0]).toEqual({
        id: 'item-1',
        title: 'Implement feature X',
        description: 'Description of feature X',
        branchName: 'feature-branch-1',
        status: 'For Implementation',
        createdAt: new Date('2026-01-25T10:00:00Z')
      });
      expect(workItems[1]).toEqual({
        id: 'item-2',
        title: 'Fix bug Y',
        description: 'Description of bug Y',
        branchName: 'feature-branch-2',
        status: 'For Implementation',
        createdAt: new Date('2026-01-25T11:00:00Z')
      });
    });

    it('should filter work items by target status', async () => {
      const mockResponse = {
        organization: {
          projectV2: {
            items: {
              nodes: [
                {
                  id: 'item-1',
                  fieldValues: {
                    nodes: [
                      {
                        field: { name: 'Status' },
                        name: 'For Implementation'
                      },
                      {
                        field: { name: 'Branch' },
                        text: 'feature-branch-1'
                      }
                    ]
                  },
                  content: {
                    title: 'Implement feature X',
                    body: '',
                    createdAt: '2026-01-25T10:00:00Z'
                  }
                },
                {
                  id: 'item-2',
                  fieldValues: {
                    nodes: [
                      {
                        field: { name: 'Status' },
                        name: 'In Progress'
                      },
                      {
                        field: { name: 'Branch' },
                        text: 'feature-branch-2'
                      }
                    ]
                  },
                  content: {
                    title: 'Fix bug Y',
                    body: '',
                    createdAt: '2026-01-25T11:00:00Z'
                  }
                }
              ]
            }
          }
        }
      };

      mockGraphql.mockResolvedValue(mockResponse);

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(1);
      expect(workItems[0].id).toBe('item-1');
    });

    it('should skip work items without branch name', async () => {
      const mockResponse = {
        organization: {
          projectV2: {
            items: {
              nodes: [
                {
                  id: 'item-1',
                  fieldValues: {
                    nodes: [
                      {
                        field: { name: 'Status' },
                        name: 'For Implementation'
                      }
                    ]
                  },
                  content: {
                    title: 'Implement feature X',
                    body: '',
                    createdAt: '2026-01-25T10:00:00Z'
                  }
                }
              ]
            }
          }
        }
      };

      mockGraphql.mockResolvedValue(mockResponse);

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(0);
    });

    it('should return empty array when no items found', async () => {
      const mockResponse = {
        organization: {
          projectV2: {
            items: {
              nodes: []
            }
          }
        }
      };

      mockGraphql.mockResolvedValue(mockResponse);

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(0);
    });

    it('should throw WorkItemError on API failure', async () => {
      mockGraphql.mockRejectedValue(new Error('API error'));

      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(WorkItemError);
      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(
        'Failed to fetch work items'
      );
    });

    it('should throw WorkItemError on rate limit error', async () => {
      mockGraphql.mockRejectedValue(new Error('rate limit exceeded'));

      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(WorkItemError);
      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(
        'GitHub API rate limit exceeded'
      );
    });

    it('should retry on transient failures', async () => {
      mockGraphql
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          organization: {
            projectV2: {
              items: {
                nodes: []
              }
            }
          }
        });

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(0);
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('should cache API token after first retrieval', async () => {
      mockGraphql.mockResolvedValue({
        organization: {
          projectV2: {
            items: {
              nodes: []
            }
          }
        }
      });

      await monitor.fetchWorkItems(projectConfig);
      expect(mockSecretsClient.send).toHaveBeenCalledTimes(1);

      await monitor.fetchWorkItems(projectConfig);
      expect(mockSecretsClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateWorkItem', () => {
    const workItem: WorkItem = {
      id: 'item-1',
      title: 'Test work item',
      description: 'Test description',
      branchName: 'feature-branch',
      status: 'For Implementation',
      createdAt: new Date('2026-01-25T10:00:00Z')
    };

    it('should validate work item successfully', async () => {
      mockOctokit.repos.getBranch.mockResolvedValue({});
      mockOctokit.repos.getContent.mockResolvedValue({});
      mockOctokit.pulls.list.mockResolvedValue({
        data: [{ number: 42, html_url: 'https://github.com/test-owner/test-repo/pull/42' }]
      });

      const result = await monitor.validateWorkItem(workItem);

      expect(result.isValid).toBe(true);
      expect(result.branchExists).toBe(true);
      expect(result.specFolderExists).toBe(true);
      expect(result.specFolderMatchesBranch).toBe(true);
      expect(result.pullRequestExists).toBe(true);
      expect(result.pullRequestMatchesBranch).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing branch', async () => {
      mockOctokit.repos.getBranch.mockRejectedValue(new Error('Branch not found'));

      const result = await monitor.validateWorkItem(workItem);

      expect(result.isValid).toBe(false);
      expect(result.branchExists).toBe(false);
      expect(result.errors).toContain("Branch 'feature-branch' does not exist");
    });

    it('should detect missing spec folder', async () => {
      mockOctokit.repos.getBranch.mockResolvedValue({});
      mockOctokit.repos.getContent.mockRejectedValue(new Error('Not found'));
      mockOctokit.pulls.list.mockResolvedValue({ data: [] });

      const result = await monitor.validateWorkItem(workItem);

      expect(result.isValid).toBe(false);
      expect(result.specFolderExists).toBe(false);
      expect(result.errors).toContain("Spec folder '.kiro/specs/feature-branch' does not exist");
    });

    it('should detect missing pull request', async () => {
      mockOctokit.repos.getBranch.mockResolvedValue({});
      mockOctokit.repos.getContent.mockResolvedValue({});
      mockOctokit.pulls.list.mockResolvedValue({ data: [] });

      const result = await monitor.validateWorkItem(workItem);

      expect(result.isValid).toBe(false);
      expect(result.pullRequestExists).toBe(false);
      expect(result.errors).toContain("No pull request found for branch 'feature-branch'");
    });

    it('should handle validation errors gracefully', async () => {
      mockOctokit.repos.getBranch.mockRejectedValue(new Error('API error'));

      const result = await monitor.validateWorkItem(workItem);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('extractBranchName', () => {
    it('should extract branch name from work item', () => {
      const workItem: WorkItem = {
        id: 'item-1',
        title: 'Test',
        description: '',
        branchName: 'feature-branch',
        status: 'For Implementation',
        createdAt: new Date()
      };

      const branchName = monitor.extractBranchName(workItem);

      expect(branchName).toBe('feature-branch');
    });
  });

  describe('verifyPullRequestExists', () => {
    it('should return true when PR exists', async () => {
      mockOctokit.pulls.list.mockResolvedValue({
        data: [{ number: 42 }]
      });

      const exists = await monitor.verifyPullRequestExists('feature-branch');

      expect(exists).toBe(true);
      expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        head: 'test-owner:feature-branch',
        state: 'open'
      });
    });

    it('should return false when no PR exists', async () => {
      mockOctokit.pulls.list.mockResolvedValue({ data: [] });

      const exists = await monitor.verifyPullRequestExists('feature-branch');

      expect(exists).toBe(false);
    });

    it('should return false on API error', async () => {
      mockOctokit.pulls.list.mockRejectedValue(new Error('API error'));

      const exists = await monitor.verifyPullRequestExists('feature-branch');

      expect(exists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle empty secret value', async () => {
      mockSecretsClient.send.mockResolvedValue({ SecretString: '' });

      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(WorkItemError);
      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(
        'Secret value is empty'
      );
    });

    it('should handle secret retrieval failure', async () => {
      mockSecretsClient.send.mockRejectedValue(new Error('Secret not found'));

      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(WorkItemError);
      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(
        'Failed to retrieve GitHub API token'
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockSecretsClient.send.mockRejectedValue('String error');

      await expect(monitor.fetchWorkItems(projectConfig)).rejects.toThrow(WorkItemError);
    });
  });

  describe('edge cases', () => {
    it('should handle missing organization in response', async () => {
      mockGraphql.mockResolvedValue({});

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(0);
    });

    it('should handle missing content in work item', async () => {
      const mockResponse = {
        organization: {
          projectV2: {
            items: {
              nodes: [
                {
                  id: 'item-1',
                  fieldValues: {
                    nodes: [
                      {
                        field: { name: 'Status' },
                        name: 'For Implementation'
                      },
                      {
                        field: { name: 'Branch' },
                        text: 'feature-branch'
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      };

      mockGraphql.mockResolvedValue(mockResponse);

      const workItems = await monitor.fetchWorkItems(projectConfig);

      expect(workItems).toHaveLength(1);
      expect(workItems[0].title).toBe('');
      expect(workItems[0].description).toBe('');
    });
  });
});
