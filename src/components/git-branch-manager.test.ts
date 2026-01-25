import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitBranchManager } from './git-branch-manager';
import { GitOperationError, ValidationError } from '../errors';
import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Mock simple-git
const mockGitInstances = new Map();

vi.mock('simple-git', () => ({
  default: vi.fn((repoPath: string) => {
    if (!mockGitInstances.has(repoPath)) {
      mockGitInstances.set(repoPath, {
        fetch: vi.fn().mockResolvedValue(undefined),
        branch: vi.fn().mockResolvedValue({ all: ['origin/main', 'origin/feature-branch'] }),
        checkout: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockResolvedValue(undefined)
      });
    }
    return mockGitInstances.get(repoPath);
  })
}));

// Mock @octokit/rest
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    pulls: {
      list: vi.fn().mockResolvedValue({ data: [{ number: 1 }] })
    }
  }))
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    access: vi.fn().mockResolvedValue(undefined)
  }
}));

const secretsManagerMock = mockClient(SecretsManagerClient);

describe('GitBranchManager', () => {
  let manager: GitBranchManager;

  beforeEach(() => {
    secretsManagerMock.reset();
    manager = new GitBranchManager({
      repoPath: '/test/repo',
      region: 'us-east-1',
      gitCredentialsSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:git-creds',
      githubTokenSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:github-token'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkoutBranch', () => {
    it('should successfully checkout an existing branch', async () => {
      await expect(manager.checkoutBranch('feature-branch')).resolves.not.toThrow();
    });

    it('should throw error if branch does not exist', async () => {
      const simpleGit = await import('simple-git');
      const mockGit = simpleGit.default('/test/repo') as any;
      mockGit.branch.mockResolvedValueOnce({ all: ['origin/main'] });

      await expect(manager.checkoutBranch('non-existent'))
        .rejects
        .toThrow(GitOperationError);
    });

    it('should retry on transient failures', async () => {
      const simpleGit = await import('simple-git');
      const mockGit = simpleGit.default('/test/repo') as any;
      
      mockGit.checkout
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await expect(manager.checkoutBranch('feature-branch')).resolves.not.toThrow();
    });
  });

  describe('validateSpecFiles', () => {
    it('should return valid result when all files exist', async () => {
      const result = await manager.validateSpecFiles('feature-branch');

      expect(result.isValid).toBe(true);
      expect(result.specFolderExists).toBe(true);
      expect(result.requiredFilesExist?.requirements).toBe(true);
      expect(result.requiredFilesExist?.design).toBe(true);
      expect(result.requiredFilesExist?.tasks).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid result when spec folder does not exist', async () => {
      const fs = await import('fs');
      vi.mocked(fs.promises.stat).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await manager.validateSpecFiles('feature-branch');

      expect(result.isValid).toBe(false);
      expect(result.specFolderExists).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return invalid result when requirements.md is missing', async () => {
      const fs = await import('fs');
      const mockAccess = vi.mocked(fs.promises.access);
      
      // Reset and setup: stat succeeds, first access (requirements.md) fails
      mockAccess.mockReset();
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
      mockAccess.mockResolvedValue(undefined); // design.md and tasks.md succeed

      const result = await manager.validateSpecFiles('feature-branch');

      expect(result.isValid).toBe(false);
      expect(result.requiredFilesExist?.requirements).toBe(false);
    });
  });

  describe('validatePullRequestExists', () => {
    it('should return true when PR exists', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify({ token: 'ghp_test123' })
      });

      const result = await manager.validatePullRequestExists('feature-branch', 'owner', 'repo');

      expect(result).toBe(true);
    });

    it('should return false when no PR exists', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify({ token: 'ghp_test123' })
      });

      // Create a new manager instance to reset Octokit
      const newManager = new GitBranchManager({
        repoPath: '/test/repo',
        region: 'us-east-1',
        githubTokenSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:github-token'
      });

      const Octokit = await import('@octokit/rest');
      const OctokitConstructor = Octokit.Octokit as any;
      OctokitConstructor.mockImplementationOnce(() => ({
        pulls: {
          list: vi.fn().mockResolvedValue({ data: [] })
        }
      }));

      const result = await newManager.validatePullRequestExists('feature-branch', 'owner', 'repo');

      expect(result).toBe(false);
    });

    it('should retry on API failures', async () => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: JSON.stringify({ token: 'ghp_test123' })
      });

      const Octokit = await import('@octokit/rest');
      const mockOctokit = new Octokit.Octokit() as any;
      mockOctokit.pulls.list
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ data: [{ number: 1 }] });

      const result = await manager.validatePullRequestExists('feature-branch', 'owner', 'repo');

      expect(result).toBe(true);
    });
  });

  describe('commitChanges', () => {
    it('should successfully commit changes', async () => {
      await expect(manager.commitChanges('Test commit', ['file1.ts', 'file2.ts']))
        .resolves.not.toThrow();
    });

    it('should retry on commit failures', async () => {
      const simpleGit = await import('simple-git');
      const mockGit = simpleGit.default('/test/repo') as any;
      
      mockGit.commit
        .mockRejectedValueOnce(new Error('Lock error'))
        .mockResolvedValueOnce(undefined);

      await expect(manager.commitChanges('Test commit', ['file1.ts']))
        .resolves.not.toThrow();
    });

    it('should throw GitOperationError on persistent failures', async () => {
      // Create new manager to avoid mock pollution
      const newManager = new GitBranchManager({
        repoPath: '/test/repo2',
        region: 'us-east-1'
      });
      
      const simpleGit = await import('simple-git');
      const mockGit = simpleGit.default('/test/repo2') as any;
      
      mockGit.add = vi.fn().mockResolvedValue(undefined);
      mockGit.commit = vi.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(newManager.commitChanges('Test commit', ['file1.ts']))
        .rejects
        .toThrow(GitOperationError);
    });
  });

  describe('pushBranch', () => {
    it('should successfully push branch', async () => {
      await expect(manager.pushBranch('feature-branch')).resolves.not.toThrow();
    });

    it('should retry on push failures', async () => {
      const simpleGit = await import('simple-git');
      const mockGit = simpleGit.default('/test/repo') as any;
      
      mockGit.push
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await expect(manager.pushBranch('feature-branch')).resolves.not.toThrow();
    });

    it('should throw GitOperationError on persistent failures', async () => {
      // Create new manager to avoid mock pollution
      const newManager = new GitBranchManager({
        repoPath: '/test/repo3',
        region: 'us-east-1'
      });
      
      const simpleGit = await import('simple-git');
      const mockGit = simpleGit.default('/test/repo3') as any;
      
      mockGit.push = vi.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(newManager.pushBranch('feature-branch'))
        .rejects
        .toThrow(GitOperationError);
    });
  });
});
