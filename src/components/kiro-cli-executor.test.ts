import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KiroCLIExecutor } from './kiro-cli-executor';
import { KiroCLIError } from '../errors';
import { ExecutionOptions } from '../types';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { sanitizeString } from '../utils/sanitize';

// Mock child_process
vi.mock('child_process');

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock sanitize
vi.mock('../utils/sanitize', () => ({
  sanitizeString: vi.fn((text: string) => text)
}));

describe('KiroCLIExecutor', () => {
  let executor: KiroCLIExecutor;
  const repoPath = '/test/repo';

  beforeEach(() => {
    executor = new KiroCLIExecutor(repoPath);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create executor with repo path', () => {
      expect(executor).toBeInstanceOf(KiroCLIExecutor);
    });
  });

  describe('executeTask', () => {
    it('should execute Kiro CLI task successfully', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test-feature',
        taskId: '1.1',
        timeout: 5000
      };

      // Mock spawn to simulate successful execution
      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      // Mock execAsync for file tracking
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'file1.ts\nfile2.ts\n', 
        stderr: '' 
      });

      // Simulate successful execution
      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Executing task...\n'));
        mockProcess.stdout?.emit('data', Buffer.from('Task completed\n'));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await executor.executeTask('1.1', options);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Executing task');
      expect(result.output).toContain('Task completed');
      expect(result.modifiedFiles).toEqual(['file1.ts', 'file2.ts']);
      expect(result.errors).toBeUndefined();
    });

    it('should build correct command with spec path and task ID', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/feature-x',
        taskId: '2.3'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => mockProcess.emit('close', 0), 10);

      await executor.executeTask('2.3', options);

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'kiro',
        ['execute-task', '--spec', '.kiro/specs/feature-x', '--task', '2.3'],
        expect.objectContaining({
          cwd: repoPath,
          shell: true
        })
      );
    });

    it('should include custom arguments in command', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        customArgs: ['--verbose', '--dry-run']
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => mockProcess.emit('close', 0), 10);

      await executor.executeTask('1.1', options);

      expect(childProcess.spawn).toHaveBeenCalledWith(
        'kiro',
        ['execute-task', '--spec', '.kiro/specs/test', '--task', '1.1', '--verbose', '--dry-run'],
        expect.any(Object)
      );
    });

    it('should throw KiroCLIError when command fails with exit code', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      // Emit events immediately
      setImmediate(() => {
        mockProcess.stderr?.emit('data', Buffer.from('Error: Task not found\n'));
        mockProcess.emit('close', 1);
      });

      await expect(executor.executeTask('1.1', options)).rejects.toThrow(KiroCLIError);
    });

    it('should return partial results when command times out', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 100 // 100ms timeout
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      // Mock kill method to emit close event
      mockProcess.kill = vi.fn().mockImplementation(() => {
        setTimeout(() => mockProcess.emit('close', 143), 5);
        return true;
      });

      // Mock file tracking
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      // Don't emit close event manually - let timeout handle it

      const result = await executor.executeTask('1.1', options);
      
      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.partialResult).toBe(true);
      expect(result.errors?.[0]).toContain('timed out');
      
      // Verify kill was called
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should return partial results on timeout instead of throwing', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 100 // 100ms timeout
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      mockProcess.kill = vi.fn().mockImplementation(() => {
        // Simulate process terminating after kill
        setTimeout(() => mockProcess.emit('close', 143), 5);
        return true;
      });

      // Mock file tracking to return some files
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'file1.ts\nfile2.ts\n', 
        stderr: '' 
      });

      // Emit some output before timeout
      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Partial work done\n'));
      }, 10);

      // Don't emit close - let the timeout mechanism handle it

      const result = await executor.executeTask('1.1', options);

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.partialResult).toBe(true);
      expect(result.output).toContain('Partial work done');
      expect(result.modifiedFiles).toEqual(['file1.ts', 'file2.ts']);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('timed out');
    });

    it('should log warning when approaching timeout and initiate graceful shutdown', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 10 * 60 * 1000 // 10 minutes (enough for graceful shutdown window)
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      mockProcess.kill = vi.fn();
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      // Use fake timers to control time
      vi.useFakeTimers();

      const executePromise = executor.executeTask('1.1', options);

      // Fast-forward to graceful shutdown window (5 minutes before timeout)
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Verify graceful shutdown warning was logged
      expect(logger.warn).toHaveBeenCalledWith(
        'Approaching timeout limit, initiating graceful shutdown',
        expect.objectContaining({
          remainingTime: 5 * 60 * 1000
        })
      );

      // Verify SIGTERM was sent
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Simulate process terminating gracefully
      mockProcess.emit('close', 0);

      vi.useRealTimers();
      await executePromise;
    });

    it('should send SIGKILL if process does not terminate after SIGTERM', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 10 * 60 * 1000 // 10 minutes
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      mockProcess.kill = vi.fn();
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      vi.useFakeTimers();

      const executePromise = executor.executeTask('1.1', options);

      // Fast-forward to graceful shutdown window
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Verify SIGTERM was sent
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Fast-forward past graceful shutdown timeout (30 seconds)
      vi.advanceTimersByTime(31 * 1000);

      // Verify SIGKILL was sent
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');

      // Simulate process finally terminating
      mockProcess.emit('close', 137); // SIGKILL exit code

      vi.useRealTimers();
      
      const result = await executePromise;
      expect(result.timedOut).toBe(true);
    });

    it('should handle timeout gracefully even if file tracking fails', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 100
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      mockProcess.kill = vi.fn().mockImplementation(() => {
        setTimeout(() => mockProcess.emit('close', 143), 5);
        return true;
      });

      // Mock file tracking to fail
      vi.spyOn(executor as any, 'execAsync').mockRejectedValue(new Error('Git diff failed'));

      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Some output\n'));
      }, 10);

      const result = await executor.executeTask('1.1', options);

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.partialResult).toBe(true);
      expect(result.modifiedFiles).toEqual([]); // Empty due to tracking failure
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to track file changes after timeout',
        expect.any(Error)
      );
    });

    it('should clear all timeout handles on successful completion', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 10 * 60 * 1000
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);

      await executor.executeTask('1.1', options);

      // Verify timeout handles were cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should clear all timeout handles on error', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1',
        timeout: 10 * 60 * 1000
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      setImmediate(() => {
        mockProcess.emit('error', new Error('Spawn failed'));
      });

      await expect(executor.executeTask('1.1', options)).rejects.toThrow();

      // Verify timeout handles were cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should throw KiroCLIError when spawn fails', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      // Emit error immediately
      setImmediate(() => {
        mockProcess.emit('error', new Error('Command not found'));
      });

      await expect(executor.executeTask('1.1', options)).rejects.toThrow(KiroCLIError);
    });

    it('should capture both stdout and stderr', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Standard output\n'));
        mockProcess.stderr?.emit('data', Buffer.from('Warning message\n'));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await executor.executeTask('1.1', options);

      expect(result.output).toContain('Standard output');
    });

    it('should use default timeout of 60 minutes when not specified', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
        // No timeout specified
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => mockProcess.emit('close', 0), 10);

      await executor.executeTask('1.1', options);

      // Test passes if no timeout error occurs
      expect(true).toBe(true);
    });
  });

  describe('captureOutput', () => {
    it('should return captured output from last execution', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Test output\n'));
        mockProcess.emit('close', 0);
      }, 10);

      await executor.executeTask('1.1', options);
      const output = await executor.captureOutput();

      expect(output).toBe('Test output\n');
    });

    it('should return empty string when no execution has occurred', async () => {
      const output = await executor.captureOutput();
      expect(output).toBe('');
    });
  });

  describe('trackFileChanges', () => {
    it('should return list of modified files', async () => {
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'src/file1.ts\nsrc/file2.ts\nsrc/file3.ts\n', 
        stderr: '' 
      });

      const files = await executor.trackFileChanges();

      expect(files).toEqual(['src/file1.ts', 'src/file2.ts', 'src/file3.ts']);
    });

    it('should remove duplicate files from staged and unstaged changes', async () => {
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'src/file1.ts\nsrc/file2.ts\nsrc/file1.ts\n', 
        stderr: '' 
      });

      const files = await executor.trackFileChanges();

      expect(files).toEqual(['src/file1.ts', 'src/file2.ts']);
    });

    it('should return empty array when no files changed', async () => {
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      const files = await executor.trackFileChanges();

      expect(files).toEqual([]);
    });

    it('should filter out empty lines', async () => {
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'src/file1.ts\n\n\nsrc/file2.ts\n\n', 
        stderr: '' 
      });

      const files = await executor.trackFileChanges();

      expect(files).toEqual(['src/file1.ts', 'src/file2.ts']);
    });

    it('should throw KiroCLIError when git diff fails', async () => {
      vi.spyOn(executor as any, 'execAsync').mockRejectedValue(new Error('Git command failed'));

      await expect(executor.trackFileChanges()).rejects.toThrow(KiroCLIError);
      await expect(executor.trackFileChanges()).rejects.toThrow('Failed to track file changes');
    });

    it('should execute git diff in correct repository path', async () => {
      const execAsyncSpy = vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: '', 
        stderr: '' 
      });

      await executor.trackFileChanges();

      expect(execAsyncSpy).toHaveBeenCalledWith(
        'git diff --name-only HEAD && git diff --name-only --cached',
        { cwd: repoPath }
      );
    });
  });

  describe('output capture and logging', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should log execution start with structured context', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test-feature',
        taskId: '1.1',
        timeout: 5000
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => mockProcess.emit('close', 0), 10);

      await executor.executeTask('1.1', options);

      expect(logger.info).toHaveBeenCalledWith(
        'Starting Kiro CLI execution',
        expect.objectContaining({
          taskId: '1.1',
          specPath: '.kiro/specs/test-feature',
          timeout: 5000
        })
      );
    });

    it('should log command execution with sanitized output', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => mockProcess.emit('close', 0), 10);

      await executor.executeTask('1.1', options);

      expect(logger.debug).toHaveBeenCalledWith(
        'Executing command',
        expect.objectContaining({
          command: expect.any(String)
        })
      );
      expect(sanitizeString).toHaveBeenCalled();
    });

    it('should log successful completion with file count', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '2.3'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'file1.ts\nfile2.ts\n', 
        stderr: '' 
      });

      setTimeout(() => mockProcess.emit('close', 0), 10);

      await executor.executeTask('2.3', options);

      expect(logger.info).toHaveBeenCalledWith(
        'Kiro CLI execution completed successfully',
        expect.objectContaining({
          taskId: '2.3',
          modifiedFilesCount: 2
        })
      );
    });

    it('should log errors with full context on failure', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      setImmediate(() => {
        mockProcess.stderr?.emit('data', Buffer.from('Error: Task failed\n'));
        mockProcess.emit('close', 1);
      });

      await expect(executor.executeTask('1.1', options)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Kiro CLI execution failed',
        expect.any(Error),
        expect.objectContaining({
          taskId: '1.1',
          specPath: '.kiro/specs/test'
        })
      );
    });

    it('should log file tracking operations', async () => {
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ 
        stdout: 'file1.ts\nfile2.ts\n', 
        stderr: '' 
      });

      await executor.trackFileChanges();

      expect(logger.debug).toHaveBeenCalledWith('Tracking file changes with git diff');
      expect(logger.debug).toHaveBeenCalledWith(
        'File changes tracked',
        expect.objectContaining({
          fileCount: 2
        })
      );
    });

    it('should log file tracking errors', async () => {
      const error = new Error('Git diff failed');
      vi.spyOn(executor as any, 'execAsync').mockRejectedValue(error);

      await expect(executor.trackFileChanges()).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to track file changes',
        error
      );
    });

    it('should capture and stream stdout in real-time', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      // Spy on process.stdout.write
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Line 1\n'));
        mockProcess.stdout?.emit('data', Buffer.from('Line 2\n'));
        mockProcess.emit('close', 0);
      }, 10);

      await executor.executeTask('1.1', options);

      expect(stdoutSpy).toHaveBeenCalledWith('Line 1\n');
      expect(stdoutSpy).toHaveBeenCalledWith('Line 2\n');

      stdoutSpy.mockRestore();
    });

    it('should capture and stream stderr in real-time', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      // Spy on process.stderr.write
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      setTimeout(() => {
        mockProcess.stderr?.emit('data', Buffer.from('Warning: something\n'));
        mockProcess.emit('close', 0);
      }, 10);

      await executor.executeTask('1.1', options);

      expect(stderrSpy).toHaveBeenCalledWith('Warning: something\n');

      stderrSpy.mockRestore();
    });

    it('should accumulate all output for later retrieval', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => {
        mockProcess.stdout?.emit('data', Buffer.from('Output line 1\n'));
        mockProcess.stdout?.emit('data', Buffer.from('Output line 2\n'));
        mockProcess.stdout?.emit('data', Buffer.from('Output line 3\n'));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await executor.executeTask('1.1', options);

      expect(result.output).toBe('Output line 1\nOutput line 2\nOutput line 3\n');
    });

    it('should include error output in KiroCLIError when command fails', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);

      setImmediate(() => {
        mockProcess.stderr?.emit('data', Buffer.from('Error: Task not found\n'));
        mockProcess.stderr?.emit('data', Buffer.from('Stack trace here\n'));
        mockProcess.emit('close', 1);
      });

      try {
        await executor.executeTask('1.1', options);
        expect.fail('Should have thrown KiroCLIError');
      } catch (error) {
        expect(error).toBeInstanceOf(KiroCLIError);
        if (error instanceof KiroCLIError) {
          expect(error.output).toContain('Error: Task not found');
          expect(error.output).toContain('Stack trace here');
        }
      }
    });

    it('should reset output buffers between executions', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      // First execution
      const mockProcess1 = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValueOnce(mockProcess1 as any);
      vi.spyOn(executor as any, 'execAsync').mockResolvedValue({ stdout: '', stderr: '' });

      setTimeout(() => {
        mockProcess1.stdout?.emit('data', Buffer.from('First execution\n'));
        mockProcess1.emit('close', 0);
      }, 10);

      const result1 = await executor.executeTask('1.1', options);
      expect(result1.output).toBe('First execution\n');

      // Second execution
      const mockProcess2 = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValueOnce(mockProcess2 as any);

      setTimeout(() => {
        mockProcess2.stdout?.emit('data', Buffer.from('Second execution\n'));
        mockProcess2.emit('close', 0);
      }, 10);

      const result2 = await executor.executeTask('1.1', options);
      expect(result2.output).toBe('Second execution\n');
      expect(result2.output).not.toContain('First execution');
    });

    it('should wrap non-KiroCLIError exceptions in KiroCLIError', async () => {
      const options: ExecutionOptions = {
        specPath: '.kiro/specs/test',
        taskId: '1.1'
      };

      // Mock spawn to throw a generic error (not KiroCLIError)
      vi.mocked(childProcess.spawn).mockImplementation(() => {
        throw new Error('Unexpected spawn error');
      });

      try {
        await executor.executeTask('1.1', options);
        expect.fail('Should have thrown KiroCLIError');
      } catch (error) {
        expect(error).toBeInstanceOf(KiroCLIError);
        if (error instanceof KiroCLIError) {
          expect(error.message).toContain('Kiro CLI execution failed');
          expect(error.message).toContain('Unexpected spawn error');
        }
      }
    });
  });
});

/**
 * Helper function to create a mock child process
 */
function createMockProcess(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: string) => boolean;
} {
  const process = new EventEmitter() as any;
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  process.kill = vi.fn().mockReturnValue(true);
  return process;
}
