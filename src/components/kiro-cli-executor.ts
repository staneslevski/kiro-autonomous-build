/**
 * Kiro CLI Executor Component
 * 
 * Executes Kiro CLI commands with specified spec tasks, captures output,
 * and tracks file changes.
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ExecutionOptions } from '../types';
import { KiroCLIError } from '../errors';
import { logger } from '../utils/logger';
import { sanitizeString } from '../utils/sanitize';

export interface ExecutionResult {
  readonly success: boolean;
  readonly output: string;
  readonly modifiedFiles: string[];
  readonly errors?: string[];
  readonly timedOut?: boolean;
  readonly partialResult?: boolean;
}

/**
 * Kiro CLI Executor
 * 
 * Responsible for executing Kiro CLI commands, capturing output,
 * and tracking file changes during execution.
 */
export class KiroCLIExecutor {
  private readonly repoPath: string;
  private output: string = '';
  private errorOutput: string = '';
  protected execAsync = promisify(exec);

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Execute a Kiro CLI task
   * 
   * @param taskId - The task identifier to execute
   * @param options - Execution options including spec path and custom arguments
   * @returns Execution result with success status, output, and modified files
   * @throws {KiroCLIError} If Kiro CLI execution fails (non-timeout errors)
   */
  async executeTask(taskId: string, options: ExecutionOptions): Promise<ExecutionResult> {
    logger.info('Starting Kiro CLI execution', {
      taskId,
      specPath: options.specPath,
      timeout: options.timeout
    });

    // Reset output buffers
    this.output = '';
    this.errorOutput = '';

    try {
      // Build command
      const command = this.buildCommand(taskId, options);
      logger.debug('Executing command', { command: sanitizeString(command) });

      // Execute command with timeout
      await this.executeCommand(command, options.timeout);

      // Track file changes
      const modifiedFiles = await this.trackFileChanges();

      logger.info('Kiro CLI execution completed successfully', {
        taskId,
        modifiedFilesCount: modifiedFiles.length
      });

      return {
        success: true,
        output: this.output,
        modifiedFiles,
        errors: undefined,
        timedOut: false,
        partialResult: false
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is a timeout error
      const isTimeout = errorMessage.includes('timed out') || errorMessage.includes('timeout');
      
      if (isTimeout) {
        logger.warn('Kiro CLI execution timed out, returning partial results', {
          taskId,
          specPath: options.specPath,
          outputLength: this.output.length
        });

        // Attempt to track file changes even on timeout
        let modifiedFiles: string[] = [];
        try {
          modifiedFiles = await this.trackFileChanges();
          logger.info('Successfully tracked file changes after timeout', {
            fileCount: modifiedFiles.length
          });
        } catch (trackError) {
          logger.warn('Failed to track file changes after timeout', trackError);
        }

        // Return partial results for timeout
        return {
          success: false,
          output: this.output,
          modifiedFiles,
          errors: [errorMessage],
          timedOut: true,
          partialResult: true
        };
      }

      // Non-timeout error - log and throw
      logger.error('Kiro CLI execution failed', error, {
        taskId,
        specPath: options.specPath
      });

      if (error instanceof KiroCLIError) {
        throw error;
      }

      throw new KiroCLIError(
        `Kiro CLI execution failed: ${errorMessage}`,
        this.buildCommand(taskId, options),
        undefined,
        this.errorOutput || this.output,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Capture output from the last execution
   * 
   * @returns The captured output as a string
   */
  async captureOutput(): Promise<string> {
    return this.output;
  }

  /**
   * Track file changes after Kiro CLI execution
   * 
   * Uses git diff to identify modified files
   * 
   * @returns Array of modified file paths
   */
  async trackFileChanges(): Promise<string[]> {
    try {
      logger.debug('Tracking file changes with git diff');

      // Get list of modified files (staged and unstaged)
      const result = await this.execAsync(
        'git diff --name-only HEAD && git diff --name-only --cached',
        { cwd: this.repoPath }
      );

      const stdout = result?.stdout || '';
      const files = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        // Remove duplicates
        .filter((file, index, self) => self.indexOf(file) === index);

      logger.debug('File changes tracked', { fileCount: files.length });

      return files;
    } catch (error) {
      logger.error('Failed to track file changes', error);
      throw new KiroCLIError(
        'Failed to track file changes',
        'git diff',
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Build the Kiro CLI command string
   */
  private buildCommand(taskId: string, options: ExecutionOptions): string {
    const args = [
      'execute-task',
      '--spec', options.specPath,
      '--task', taskId
    ];

    // Add custom arguments if provided
    if (options.customArgs && options.customArgs.length > 0) {
      args.push(...options.customArgs);
    }

    return `kiro ${args.join(' ')}`;
  }

  /**
   * Execute command with timeout handling
   * 
   * Implements graceful timeout handling:
   * - Monitors remaining execution time
   * - Sends SIGTERM for graceful shutdown when timeout approaches
   * - Sends SIGKILL if process doesn't terminate gracefully
   * - Captures partial results on timeout
   */
  private async executeCommand(command: string, timeout?: number): Promise<void> {
    const timeoutMs = timeout || 60 * 60 * 1000; // Default: 60 minutes
    const gracefulShutdownWindow = 5 * 60 * 1000; // 5 minutes before timeout
    const gracefulShutdownTimeout = 30 * 1000; // 30 seconds to respond to SIGTERM

    return new Promise<void>((resolve, reject) => {
      // Parse command into executable and arguments
      const parts = command.split(' ');
      const executable = parts[0];
      const args = parts.slice(1);

      const childProcess = spawn(executable, args, {
        cwd: this.repoPath,
        shell: true,
        env: process.env
      });

      let gracefulShutdownInitiated = false;
      let timeoutHandle: NodeJS.Timeout | null = null;
      let gracefulShutdownHandle: NodeJS.Timeout | null = null;
      let killHandle: NodeJS.Timeout | null = null;

      // Set graceful shutdown warning (5 minutes before timeout)
      if (timeoutMs > gracefulShutdownWindow) {
        gracefulShutdownHandle = setTimeout(() => {
          logger.warn('Approaching timeout limit, initiating graceful shutdown', {
            remainingTime: gracefulShutdownWindow,
            command: sanitizeString(command)
          });
          gracefulShutdownInitiated = true;
          
          // Send SIGTERM for graceful shutdown
          childProcess.kill('SIGTERM');
          
          // Set hard kill timeout if process doesn't terminate
          killHandle = setTimeout(() => {
            logger.error('Process did not terminate gracefully, forcing kill');
            childProcess.kill('SIGKILL');
          }, gracefulShutdownTimeout);
        }, timeoutMs - gracefulShutdownWindow);
      }

      // Set hard timeout
      timeoutHandle = setTimeout(() => {
        if (!gracefulShutdownInitiated) {
          logger.error('Command exceeded timeout limit', {
            timeoutMs,
            command: sanitizeString(command)
          });
          gracefulShutdownInitiated = true; // Mark as timeout scenario
          childProcess.kill('SIGTERM');
          
          // Force kill if not terminated within grace period
          killHandle = setTimeout(() => {
            childProcess.kill('SIGKILL');
          }, gracefulShutdownTimeout);
        }
      }, timeoutMs);

      // Capture stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.output += text;
        // Log in real-time for monitoring
        process.stdout.write(text);
      });

      // Capture stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.errorOutput += text;
        // Log in real-time for monitoring
        process.stderr.write(text);
      });

      // Handle process completion
      childProcess.on('close', (code: number | null) => {
        // Clear all timeout handles
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (gracefulShutdownHandle) clearTimeout(gracefulShutdownHandle);
        if (killHandle) clearTimeout(killHandle);

        if (gracefulShutdownInitiated) {
          // Process was terminated due to approaching timeout
          logger.warn('Process terminated due to timeout limit', {
            exitCode: code,
            outputLength: this.output.length
          });
          
          reject(new KiroCLIError(
            `Command timed out after ${timeoutMs}ms (graceful shutdown)`,
            command,
            code ?? undefined,
            this.output || this.errorOutput
          ));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new KiroCLIError(
            `Command failed with exit code ${code}`,
            command,
            code ?? undefined,
            this.errorOutput || this.output
          ));
        }
      });

      // Handle process errors
      childProcess.on('error', (error: Error) => {
        // Clear all timeout handles
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (gracefulShutdownHandle) clearTimeout(gracefulShutdownHandle);
        if (killHandle) clearTimeout(killHandle);
        
        reject(new KiroCLIError(
          `Failed to execute command: ${error.message}`,
          command,
          undefined,
          this.errorOutput || this.output,
          error
        ));
      });
    });
  }
}
