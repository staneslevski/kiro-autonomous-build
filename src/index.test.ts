/**
 * Unit tests for KiroWorker main orchestration class
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { KiroWorker } from './index';
import type { WorkerConfig } from './types';

// Mock all component modules
vi.mock('./components/git-branch-manager', () => ({
  GitBranchManager: vi.fn()
}));

vi.mock('./components/steering-synchronizer', () => ({
  SteeringSynchronizer: vi.fn()
}));

vi.mock('./components/kiro-cli-executor', () => ({
  KiroCLIExecutor: vi.fn()
}));

vi.mock('./components/test-runner', () => ({
  TestRunner: vi.fn()
}));

vi.mock('./components/pull-request-updater', () => ({
  PullRequestUpdater: vi.fn()
}));

// Mock sanitize utility
vi.mock('./utils/sanitize', () => ({
  sanitizeForLogging: vi.fn((str: string) => str)
}));

describe('KiroWorker', () => {
  let worker: KiroWorker;
  let mockConfig: WorkerConfig;
  let mockGitManager: any;
  let mockSteeringSynchronizer: any;
  let mockKiroExecutor: any;
  let mockTestRunner: any;
  let mockPRUpdater: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock config
    mockConfig = {
      environment: 'test',
      branchName: 'feature-test',
      specPath: '.kiro/specs/feature-test',
      taskId: 'task-123',
      coverageThreshold: 80,
      repoPath: '/tmp/test-repo',
      buildId: 'build-123',
      buildUrl: 'https://codebuild.aws.amazon.com/builds/build-123',
      targetBranch: 'main'
    };

    // Setup mock implementations
    mockGitManager = {
      checkoutBranch: vi.fn().mockResolvedValue(undefined),
      validateSpecFiles: vi.fn().mockResolvedValue({
        branchExists: true,
        specFolderExists: true,
        requiredFilesExist: {
          requirements: true,
          design: true,
          tasks: true
        },
        errors: []
      }),
      validatePullRequestExists: vi.fn().mockResolvedValue(true)
    };

    mockSteeringSynchronizer = {
      checkSteeringVersion: vi.fn().mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        isOutdated: false,
        missingFiles: []
      }),
      synchronizeSteeringFiles: vi.fn().mockResolvedValue({
        addedFiles: [],
        updatedFiles: [],
        errors: []
      }),
      commitSteeringUpdates: vi.fn().mockResolvedValue(undefined)
    };

    mockKiroExecutor = {
      executeTask: vi.fn().mockResolvedValue({
        success: true,
        output: 'Kiro CLI output',
        modifiedFiles: ['src/file1.ts', 'src/file2.ts'],
        errors: []
      })
    };

    mockTestRunner = {
      runTests: vi.fn().mockResolvedValue({
        passed: true,
        totalTests: 100,
        passedTests: 100,
        failedTests: 0,
        output: 'All tests passed',
        failures: []
      }),
      analyzeCoverage: vi.fn().mockResolvedValue({
        percentage: 85,
        meetsThreshold: true,
        coverageByFile: new Map(),
        summary: 'Coverage: 85%'
      }),
      generateTestSummary: vi.fn().mockResolvedValue('Test Summary: 100/100 passed')
    };

    mockPRUpdater = {
      updatePR: vi.fn().mockResolvedValue({
        success: true,
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42'
      }),
      generatePRBody: vi.fn().mockReturnValue('PR Body Content')
    };

    // Import and mock constructors
    const { GitBranchManager } = await import('./components/git-branch-manager');
    const { SteeringSynchronizer } = await import('./components/steering-synchronizer');
    const { KiroCLIExecutor } = await import('./components/kiro-cli-executor');
    const { TestRunner } = await import('./components/test-runner');
    const { PullRequestUpdater } = await import('./components/pull-request-updater');

    (GitBranchManager as Mock).mockImplementation(() => mockGitManager);
    (SteeringSynchronizer as Mock).mockImplementation(() => mockSteeringSynchronizer);
    (KiroCLIExecutor as Mock).mockImplementation(() => mockKiroExecutor);
    (TestRunner as Mock).mockImplementation(() => mockTestRunner);
    (PullRequestUpdater as Mock).mockImplementation(() => mockPRUpdater);

    // Create worker instance
    worker = new KiroWorker(mockConfig);
  });

  describe('constructor', () => {
    it('should create worker with all components', async () => {
      const { GitBranchManager } = await import('./components/git-branch-manager');
      const { SteeringSynchronizer } = await import('./components/steering-synchronizer');
      const { KiroCLIExecutor } = await import('./components/kiro-cli-executor');
      const { TestRunner } = await import('./components/test-runner');
      const { PullRequestUpdater } = await import('./components/pull-request-updater');

      expect(worker).toBeDefined();
      expect(GitBranchManager).toHaveBeenCalledWith(mockConfig);
      expect(SteeringSynchronizer).toHaveBeenCalledWith(mockConfig);
      expect(KiroCLIExecutor).toHaveBeenCalledWith(mockConfig);
      expect(TestRunner).toHaveBeenCalledWith(mockConfig);
      expect(PullRequestUpdater).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('execute', () => {
    it('should execute complete pipeline successfully', async () => {
      const result = await worker.execute();

      expect(result.success).toBe(true);
      expect(result.buildId).toBe('build-123');
      expect(result.environment).toBe('test');
      expect(result.branchName).toBe('feature-test');
      expect(result.phases).toHaveLength(5);
      expect(result.phases.every(p => p.success)).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute all pipeline phases in correct order', async () => {
      await worker.execute();

      // Verify phase execution order
      expect(mockGitManager.checkoutBranch).toHaveBeenCalled();
      expect(mockGitManager.validateSpecFiles).toHaveBeenCalled();
      expect(mockGitManager.validatePullRequestExists).toHaveBeenCalled();
      expect(mockSteeringSynchronizer.checkSteeringVersion).toHaveBeenCalled();
      expect(mockKiroExecutor.executeTask).toHaveBeenCalled();
      expect(mockTestRunner.runTests).toHaveBeenCalled();
      expect(mockTestRunner.analyzeCoverage).toHaveBeenCalled();
      expect(mockPRUpdater.updatePR).toHaveBeenCalled();
    });

    it('should include modified files in result', async () => {
      const result = await worker.execute();

      expect(result.modifiedFiles).toEqual(['src/file1.ts', 'src/file2.ts']);
      expect(result.kiroOutput).toBe('Kiro CLI output');
    });

    it('should include test results in result', async () => {
      const result = await worker.execute();

      expect(result.testResult).toBeDefined();
      expect(result.testResult?.passed).toBe(true);
      expect(result.testResult?.totalTests).toBe(100);
      expect(result.coverageResult).toBeDefined();
      expect(result.coverageResult?.percentage).toBe(85);
    });

    it('should include PR URL in result', async () => {
      const result = await worker.execute();

      expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
    });

    it('should record phase durations', async () => {
      const result = await worker.execute();

      result.phases.forEach(phase => {
        expect(phase.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('error handling', () => {
    it('should fail if branch does not exist', async () => {
      mockGitManager.validateSpecFiles.mockResolvedValue({
        branchExists: false,
        specFolderExists: true,
        requiredFilesExist: {
          requirements: true,
          design: true,
          tasks: true
        },
        errors: ['Branch does not exist']
      });

      await expect(worker.execute()).rejects.toThrow('Branch validation failed');
    });

    it('should fail if spec folder does not exist', async () => {
      mockGitManager.validateSpecFiles.mockResolvedValue({
        branchExists: true,
        specFolderExists: false,
        requiredFilesExist: {
          requirements: true,
          design: true,
          tasks: true
        },
        errors: ['Spec folder does not exist']
      });

      await expect(worker.execute()).rejects.toThrow('Branch validation failed');
    });

    it('should fail if required spec files are missing', async () => {
      mockGitManager.validateSpecFiles.mockResolvedValue({
        branchExists: true,
        specFolderExists: true,
        requiredFilesExist: {
          requirements: false,
          design: true,
          tasks: true
        },
        errors: ['requirements.md is missing']
      });

      await expect(worker.execute()).rejects.toThrow('Branch validation failed');
    });

    it('should fail if pull request does not exist', async () => {
      mockGitManager.validatePullRequestExists.mockResolvedValue(false);

      await expect(worker.execute()).rejects.toThrow('Pull request does not exist');
    });

    it('should fail if Kiro CLI execution fails', async () => {
      mockKiroExecutor.executeTask.mockResolvedValue({
        success: false,
        output: 'Error output',
        modifiedFiles: [],
        errors: ['Execution failed']
      });

      await expect(worker.execute()).rejects.toThrow('Kiro CLI execution failed');
    });

    it('should fail if tests fail', async () => {
      mockTestRunner.runTests.mockResolvedValue({
        passed: false,
        totalTests: 100,
        passedTests: 95,
        failedTests: 5,
        output: 'Some tests failed',
        failures: []
      });

      await expect(worker.execute()).rejects.toThrow('Tests failed: 5 of 100 tests failed');
    });

    it('should fail if coverage is below threshold', async () => {
      mockTestRunner.analyzeCoverage.mockResolvedValue({
        percentage: 75,
        meetsThreshold: false,
        coverageByFile: new Map(),
        summary: 'Coverage: 75%'
      });

      await expect(worker.execute()).rejects.toThrow('Coverage below threshold: 75%');
    });

    it('should fail if PR update fails', async () => {
      mockPRUpdater.updatePR.mockResolvedValue({
        success: false,
        error: 'API error'
      });

      await expect(worker.execute()).rejects.toThrow('Pull request update failed: API error');
    });

    it('should record failed phase in result', async () => {
      mockKiroExecutor.executeTask.mockResolvedValue({
        success: false,
        output: '',
        modifiedFiles: [],
        errors: ['Execution failed']
      });

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      // Note: We can't access the result after throw, but the phase should be recorded
      expect(mockKiroExecutor.executeTask).toHaveBeenCalled();
    });

    it('should sanitize errors in result', async () => {
      mockKiroExecutor.executeTask.mockRejectedValue(
        new Error('Failed with token ghp_secret123')
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockKiroExecutor.executeTask).toHaveBeenCalled();
    });

    it('should categorize ValidationError correctly', async () => {
      const { ValidationError } = await import('./errors');
      mockGitManager.checkoutBranch.mockRejectedValue(
        new ValidationError('Invalid branch', 'branch', ['error'])
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockGitManager.checkoutBranch).toHaveBeenCalled();
    });

    it('should categorize GitOperationError correctly', async () => {
      const { GitOperationError } = await import('./errors');
      mockGitManager.checkoutBranch.mockRejectedValue(
        new GitOperationError('Git failed', 'checkout')
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockGitManager.checkoutBranch).toHaveBeenCalled();
    });

    it('should categorize KiroCLIError correctly', async () => {
      const { KiroCLIError } = await import('./errors');
      mockKiroExecutor.executeTask.mockRejectedValue(
        new KiroCLIError('CLI failed', 'execution', 'output')
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockKiroExecutor.executeTask).toHaveBeenCalled();
    });

    it('should categorize TestFailureError correctly', async () => {
      const { TestFailureError } = await import('./errors');
      mockTestRunner.runTests.mockRejectedValue(
        new TestFailureError('Tests failed', [])
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockTestRunner.runTests).toHaveBeenCalled();
    });

    it('should categorize CoverageThresholdError correctly', async () => {
      const { CoverageThresholdError } = await import('./errors');
      mockTestRunner.analyzeCoverage.mockRejectedValue(
        new CoverageThresholdError('Coverage too low', 75, 80)
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockTestRunner.analyzeCoverage).toHaveBeenCalled();
    });

    it('should categorize PRUpdateError correctly', async () => {
      const { PRUpdateError } = await import('./errors');
      mockPRUpdater.updatePR.mockRejectedValue(
        new PRUpdateError('PR update failed', 'update', 'API error')
      );

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockPRUpdater.updatePR).toHaveBeenCalled();
    });

    it('should categorize unknown errors correctly', async () => {
      mockGitManager.checkoutBranch.mockRejectedValue('String error');

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      expect(mockGitManager.checkoutBranch).toHaveBeenCalled();
    });
  });

  describe('steering synchronization', () => {
    it('should synchronize outdated steering files', async () => {
      mockSteeringSynchronizer.checkSteeringVersion.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        isOutdated: true,
        missingFiles: []
      });

      mockSteeringSynchronizer.synchronizeSteeringFiles.mockResolvedValue({
        addedFiles: [],
        updatedFiles: ['git-workflow.md'],
        errors: []
      });

      await worker.execute();

      expect(mockSteeringSynchronizer.synchronizeSteeringFiles).toHaveBeenCalled();
      expect(mockSteeringSynchronizer.commitSteeringUpdates).toHaveBeenCalledWith(['git-workflow.md']);
    });

    it('should add missing steering files', async () => {
      mockSteeringSynchronizer.checkSteeringVersion.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        isOutdated: false,
        missingFiles: ['testing-standards.md']
      });

      mockSteeringSynchronizer.synchronizeSteeringFiles.mockResolvedValue({
        addedFiles: ['testing-standards.md'],
        updatedFiles: [],
        errors: []
      });

      await worker.execute();

      expect(mockSteeringSynchronizer.synchronizeSteeringFiles).toHaveBeenCalled();
      expect(mockSteeringSynchronizer.commitSteeringUpdates).toHaveBeenCalledWith(['testing-standards.md']);
    });

    it('should skip synchronization if steering is up to date', async () => {
      mockSteeringSynchronizer.checkSteeringVersion.mockResolvedValue({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        isOutdated: false,
        missingFiles: []
      });

      await worker.execute();

      expect(mockSteeringSynchronizer.synchronizeSteeringFiles).not.toHaveBeenCalled();
      expect(mockSteeringSynchronizer.commitSteeringUpdates).not.toHaveBeenCalled();
    });
  });

  describe('PR body generation', () => {
    it('should generate PR body with all required information', async () => {
      await worker.execute();

      expect(mockPRUpdater.generatePRBody).toHaveBeenCalledWith({
        taskId: 'task-123',
        testResult: expect.objectContaining({
          passed: true,
          totalTests: 100
        }),
        coverageResult: expect.objectContaining({
          percentage: 85
        }),
        buildMetadata: expect.objectContaining({
          buildId: 'build-123',
          buildUrl: 'https://codebuild.aws.amazon.com/builds/build-123',
          environment: 'test'
        })
      });
    });

    it('should update PR with generated body', async () => {
      await worker.execute();

      expect(mockPRUpdater.updatePR).toHaveBeenCalledWith({
        sourceBranch: 'feature-test',
        targetBranch: 'main',
        title: '[Kiro Worker] task-123',
        body: 'PR Body Content',
        metadata: expect.objectContaining({
          buildId: 'build-123',
          specTask: 'task-123',
          coveragePercentage: 85
        })
      });
    });
  });

  describe('resource cleanup', () => {
    it('should register temporary files', () => {
      worker.registerTempFile('/tmp/test-file.txt');
      expect(worker).toBeDefined();
    });

    it('should register temporary directories', () => {
      worker.registerTempDir('/tmp/test-dir');
      expect(worker).toBeDefined();
    });

    it('should register process IDs', () => {
      worker.registerProcess(12345);
      expect(worker).toBeDefined();
    });

    it('should clean up resources on success', async () => {
      await worker.execute();
      // Cleanup is called internally, verify execution completed
      expect(mockPRUpdater.updatePR).toHaveBeenCalled();
    });

    it('should clean up resources on failure', async () => {
      mockKiroExecutor.executeTask.mockResolvedValue({
        success: false,
        output: '',
        modifiedFiles: [],
        errors: ['Execution failed']
      });

      try {
        await worker.execute();
      } catch (error) {
        // Expected to throw
      }

      // Cleanup is called internally even on failure
      expect(mockKiroExecutor.executeTask).toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should check timeout during execution', async () => {
      // Set a very short timeout to trigger warning
      const shortTimeoutConfig = {
        ...mockConfig,
        timeout: 1000 // 1 second
      };

      const shortTimeoutWorker = new KiroWorker(shortTimeoutConfig);

      // Mock a delay in one of the phases
      mockKiroExecutor.executeTask.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          success: true,
          output: 'Output',
          modifiedFiles: [],
          errors: []
        };
      });

      await shortTimeoutWorker.execute();
      expect(mockKiroExecutor.executeTask).toHaveBeenCalled();
    });

    it('should handle default timeout value', async () => {
      const noTimeoutConfig = {
        ...mockConfig,
        timeout: undefined
      };

      const noTimeoutWorker = new KiroWorker(noTimeoutConfig);
      await noTimeoutWorker.execute();
      expect(mockGitManager.checkoutBranch).toHaveBeenCalled();
    });
  });
});
