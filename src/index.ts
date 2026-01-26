/**
 * Main entry point for Kiro CodeBuild Worker
 * 
 * Orchestrates the complete pipeline: checkout → validate → sync steering → execute Kiro CLI → run tests → update PR
 */

import { GitBranchManager } from './components/git-branch-manager';
import { SteeringSynchronizer } from './components/steering-synchronizer';
import { KiroCLIExecutor } from './components/kiro-cli-executor';
import { TestRunner } from './components/test-runner';
import { PullRequestUpdater } from './components/pull-request-updater';
import { logger } from './utils/logger';
import { sanitizeForLogging } from './utils/sanitize';
import type { WorkerConfig, WorkerResult, PipelinePhase } from './types';
import {
  GitOperationError,
  KiroCLIError,
  TestFailureError,
  CoverageThresholdError,
  PRUpdateError,
  ValidationError
} from './errors';

export * from './types';
export * from './errors';
export * from './utils';

/**
 * Temporary resources that need cleanup
 */
interface TemporaryResources {
  tempFiles: string[];
  tempDirs: string[];
  processIds: number[];
}

/**
 * Main Kiro Worker class that orchestrates the complete pipeline
 */
export class KiroWorker {
  private readonly gitManager: GitBranchManager;
  private readonly steeringSynchronizer: SteeringSynchronizer;
  private readonly kiroExecutor: KiroCLIExecutor;
  private readonly testRunner: TestRunner;
  private readonly prUpdater: PullRequestUpdater;
  private readonly config: WorkerConfig;
  private readonly temporaryResources: TemporaryResources;
  private timeoutWarningThreshold: number;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.gitManager = new GitBranchManager(config);
    this.steeringSynchronizer = new SteeringSynchronizer(config);
    this.kiroExecutor = new KiroCLIExecutor(config);
    this.testRunner = new TestRunner(config);
    this.prUpdater = new PullRequestUpdater(config);
    this.temporaryResources = {
      tempFiles: [],
      tempDirs: [],
      processIds: []
    };
    // Set timeout warning threshold to 5 minutes before actual timeout
    this.timeoutWarningThreshold = (config.timeout || 3600000) - 300000; // Default 60 min - 5 min
  }

  /**
   * Execute the complete Kiro Worker pipeline
   * 
   * Pipeline phases:
   * 1. Checkout and validate branch
   * 2. Synchronize steering files
   * 3. Execute Kiro CLI task
   * 4. Run tests and validate coverage
   * 5. Update pull request
   * 
   * @returns WorkerResult with success status and details
   */
  async execute(): Promise<WorkerResult> {
    const startTime = Date.now();
    const result: WorkerResult = {
      success: false,
      buildId: this.config.buildId || 'unknown',
      environment: this.config.environment,
      branchName: this.config.branchName,
      phases: [],
      duration: 0,
      errors: []
    };

    try {
      logger.info('Starting Kiro Worker pipeline', {
        buildId: result.buildId,
        environment: result.environment,
        branchName: result.branchName,
        specPath: this.config.specPath
      });

      // Check timeout before starting
      this.checkTimeout(startTime);

      // Phase 1: Checkout and validate branch
      await this.executePhase(result, 'checkout', async () => {
        logger.info('Phase 1: Checking out and validating branch', {
          branchName: this.config.branchName
        });

        this.checkTimeout(startTime);

        await this.gitManager.checkoutBranch(this.config.branchName);
        
        const validation = await this.gitManager.validateSpecFiles(this.config.branchName);
        if (!validation.branchExists || !validation.specFolderExists || 
            !validation.requiredFilesExist.requirements || 
            !validation.requiredFilesExist.design || 
            !validation.requiredFilesExist.tasks) {
          throw new ValidationError(
            `Branch validation failed: ${validation.errors.join(', ')}`,
            'branch-validation',
            validation.errors
          );
        }

        const prExists = await this.gitManager.validatePullRequestExists(this.config.branchName);
        if (!prExists) {
          throw new ValidationError(
            `Pull request does not exist for branch: ${this.config.branchName}`,
            'pr-validation',
            [`No pull request found for branch ${this.config.branchName}`]
          );
        }

        logger.info('Branch validation successful');
      });

      // Phase 2: Synchronize steering files
      await this.executePhase(result, 'steering', async () => {
        logger.info('Phase 2: Synchronizing steering files');

        this.checkTimeout(startTime);

        const versionInfo = await this.steeringSynchronizer.checkSteeringVersion();
        if (versionInfo.isOutdated || versionInfo.missingFiles.length > 0) {
          const syncResult = await this.steeringSynchronizer.synchronizeSteeringFiles();
          
          if (syncResult.addedFiles.length > 0 || syncResult.updatedFiles.length > 0) {
            const allFiles = [...syncResult.addedFiles, ...syncResult.updatedFiles];
            await this.steeringSynchronizer.commitSteeringUpdates(allFiles);
            
            logger.info('Steering files synchronized', {
              added: syncResult.addedFiles.length,
              updated: syncResult.updatedFiles.length
            });
          }
        } else {
          logger.info('Steering files are up to date');
        }
      });

      // Phase 3: Execute Kiro CLI task
      await this.executePhase(result, 'kiro-cli', async () => {
        logger.info('Phase 3: Executing Kiro CLI task', {
          taskId: this.config.taskId,
          specPath: this.config.specPath
        });

        this.checkTimeout(startTime);

        const executionResult = await this.kiroExecutor.executeTask(this.config.taskId || '', {
          specPath: this.config.specPath,
          taskId: this.config.taskId || '',
          timeout: this.config.timeout
        });

        if (!executionResult.success) {
          throw new KiroCLIError(
            `Kiro CLI execution failed: ${executionResult.errors?.join(', ')}`,
            'execution',
            executionResult.output
          );
        }

        logger.info('Kiro CLI execution successful', {
          modifiedFiles: executionResult.modifiedFiles.length
        });

        // Store modified files for PR update
        result.modifiedFiles = executionResult.modifiedFiles;
        result.kiroOutput = executionResult.output;
      });

      // Phase 4: Run tests and validate coverage
      await this.executePhase(result, 'tests', async () => {
        logger.info('Phase 4: Running tests and validating coverage');

        this.checkTimeout(startTime);

        const testResult = await this.testRunner.runTests({
          testCommand: this.config.testCommand,
          coverageCommand: this.config.coverageCommand,
          coverageThreshold: this.config.coverageThreshold || 80
        });

        if (!testResult.passed) {
          throw new TestFailureError(
            `Tests failed: ${testResult.failedTests} of ${testResult.totalTests} tests failed`,
            testResult.failures
          );
        }

        const coverageResult = await this.testRunner.analyzeCoverage();
        if (!coverageResult.meetsThreshold) {
          throw new CoverageThresholdError(
            `Coverage below threshold: ${coverageResult.percentage}% (required: ${this.config.coverageThreshold || 80}%)`,
            coverageResult.percentage,
            this.config.coverageThreshold || 80
          );
        }

        logger.info('Tests passed and coverage validated', {
          totalTests: testResult.totalTests,
          passedTests: testResult.passedTests,
          coverage: coverageResult.percentage
        });

        // Store test results for PR update
        result.testResult = testResult;
        result.coverageResult = coverageResult;
      });

      // Phase 5: Update pull request
      await this.executePhase(result, 'pull-request', async () => {
        logger.info('Phase 5: Updating pull request');

        this.checkTimeout(startTime);

        const prBody = this.prUpdater.generatePRBody({
          taskId: this.config.taskId || '',
          testResult: result.testResult!,
          coverageResult: result.coverageResult!,
          buildMetadata: {
            buildId: result.buildId,
            buildUrl: this.config.buildUrl || '',
            environment: result.environment,
            timestamp: new Date()
          }
        });

        const prResult = await this.prUpdater.updatePR({
          sourceBranch: this.config.branchName,
          targetBranch: this.config.targetBranch || 'main',
          title: `[Kiro Worker] ${this.config.taskId}`,
          body: prBody,
          metadata: {
            buildId: result.buildId,
            buildUrl: this.config.buildUrl || '',
            specTask: this.config.taskId || '',
            testSummary: await this.testRunner.generateTestSummary(),
            coveragePercentage: result.coverageResult!.percentage,
            modifiedFiles: result.modifiedFiles || []
          }
        });

        if (!prResult.success) {
          throw new PRUpdateError(
            `Pull request update failed: ${prResult.error}`,
            'update',
            prResult.error
          );
        }

        logger.info('Pull request updated successfully', {
          prNumber: prResult.prNumber,
          prUrl: prResult.prUrl
        });

        result.prUrl = prResult.prUrl;
      });

      // Pipeline completed successfully
      result.success = true;
      result.duration = Date.now() - startTime;

      logger.info('Kiro Worker pipeline completed successfully', {
        buildId: result.buildId,
        duration: result.duration,
        phases: result.phases.length
      });

      // Clean up temporary resources on success
      await this.cleanup(false);

      return result;

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      
      // Categorize and sanitize error
      const { message, category } = this.categorizeError(error);
      const sanitizedError = sanitizeForLogging(message);
      
      result.errors.push(sanitizedError);

      logger.error('Kiro Worker pipeline failed', {
        buildId: result.buildId,
        error: sanitizedError,
        errorCategory: category,
        duration: result.duration,
        completedPhases: result.phases.filter(p => p.success).length,
        totalPhases: result.phases.length
      });

      // Clean up temporary resources on failure
      await this.cleanup(true);

      throw error;
    }
  }

  /**
   * Execute a single pipeline phase with error handling and logging
   * 
   * @param result - WorkerResult to update with phase information
   * @param phaseName - Name of the phase
   * @param phaseFunction - Async function to execute for this phase
   */
  private async executePhase(
    result: WorkerResult,
    phaseName: PipelinePhase,
    phaseFunction: () => Promise<void>
  ): Promise<void> {
    const phaseStartTime = Date.now();
    
    try {
      await phaseFunction();
      
      result.phases.push({
        name: phaseName,
        success: true,
        duration: Date.now() - phaseStartTime
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedError = sanitizeForLogging(errorMessage);
      
      result.phases.push({
        name: phaseName,
        success: false,
        duration: Date.now() - phaseStartTime,
        error: sanitizedError
      });

      logger.error(`Phase ${phaseName} failed`, {
        phase: phaseName,
        error: sanitizedError,
        duration: Date.now() - phaseStartTime
      });

      throw error;
    }
  }

  /**
   * Check if we're approaching timeout and log warning
   * 
   * @param startTime - Pipeline start time in milliseconds
   */
  private checkTimeout(startTime: number): void {
    const elapsed = Date.now() - startTime;
    const remaining = (this.config.timeout || 3600000) - elapsed;

    if (remaining < 300000 && remaining > 0) {
      logger.warn('Approaching timeout threshold', {
        elapsedMs: elapsed,
        remainingMs: remaining,
        timeoutMs: this.config.timeout || 3600000
      });
    }
  }

  /**
   * Categorize error for better logging and handling
   * 
   * @param error - Error to categorize
   * @returns Object with sanitized message and category
   */
  private categorizeError(error: unknown): { message: string; category: string } {
    if (error instanceof ValidationError) {
      return {
        message: error.message,
        category: 'validation'
      };
    }

    if (error instanceof GitOperationError) {
      return {
        message: error.message,
        category: 'git-operation'
      };
    }

    if (error instanceof KiroCLIError) {
      return {
        message: error.message,
        category: 'kiro-cli'
      };
    }

    if (error instanceof TestFailureError) {
      return {
        message: error.message,
        category: 'test-failure'
      };
    }

    if (error instanceof CoverageThresholdError) {
      return {
        message: error.message,
        category: 'coverage-threshold'
      };
    }

    if (error instanceof PRUpdateError) {
      return {
        message: error.message,
        category: 'pr-update'
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        category: 'unknown'
      };
    }

    return {
      message: String(error),
      category: 'unknown'
    };
  }

  /**
   * Clean up temporary resources
   * 
   * @param isFailure - Whether cleanup is due to failure
   */
  private async cleanup(isFailure: boolean): Promise<void> {
    try {
      logger.info('Starting resource cleanup', {
        isFailure,
        tempFiles: this.temporaryResources.tempFiles.length,
        tempDirs: this.temporaryResources.tempDirs.length,
        processIds: this.temporaryResources.processIds.length
      });

      // Clean up temporary files
      for (const file of this.temporaryResources.tempFiles) {
        try {
          const fs = await import('fs/promises');
          await fs.unlink(file);
          logger.debug('Cleaned up temporary file', { file });
        } catch (error) {
          logger.warn('Failed to clean up temporary file', {
            file,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Clean up temporary directories
      for (const dir of this.temporaryResources.tempDirs) {
        try {
          const fs = await import('fs/promises');
          await fs.rm(dir, { recursive: true, force: true });
          logger.debug('Cleaned up temporary directory', { dir });
        } catch (error) {
          logger.warn('Failed to clean up temporary directory', {
            dir,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Kill any remaining processes
      for (const pid of this.temporaryResources.processIds) {
        try {
          process.kill(pid, 'SIGTERM');
          logger.debug('Terminated process', { pid });
        } catch (error) {
          logger.warn('Failed to terminate process', {
            pid,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Clear the resources list
      this.temporaryResources.tempFiles = [];
      this.temporaryResources.tempDirs = [];
      this.temporaryResources.processIds = [];

      logger.info('Resource cleanup completed', { isFailure });
    } catch (error) {
      logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - cleanup errors shouldn't fail the build
    }
  }

  /**
   * Register a temporary file for cleanup
   * 
   * @param filePath - Path to temporary file
   */
  public registerTempFile(filePath: string): void {
    this.temporaryResources.tempFiles.push(filePath);
  }

  /**
   * Register a temporary directory for cleanup
   * 
   * @param dirPath - Path to temporary directory
   */
  public registerTempDir(dirPath: string): void {
    this.temporaryResources.tempDirs.push(dirPath);
  }

  /**
   * Register a process ID for cleanup
   * 
   * @param pid - Process ID
   */
  public registerProcess(pid: number): void {
    this.temporaryResources.processIds.push(pid);
  }
}
