/**
 * Tests for CLI entry point
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfigFromEnvironment, main } from './cli';
import type { WorkerResult } from './types';
import { KiroWorker } from './index';

// Mock the KiroWorker class
vi.mock('./index', () => ({
  KiroWorker: vi.fn()
}));

// Mock all component dependencies
vi.mock('./components/git-branch-manager');
vi.mock('./components/steering-synchronizer');
vi.mock('./components/kiro-cli-executor');
vi.mock('./components/test-runner');
vi.mock('./components/pull-request-updater');

// Mock logger
vi.mock('./utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock sanitize utility
vi.mock('./utils/sanitize', () => ({
  sanitizeForLogging: vi.fn((msg: string) => msg)
}));

describe('CLI Entry Point', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let exitCode: number | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalExit = process.exit;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;

    exitCode = undefined;
    // Mock process.exit to capture the exit code but NOT throw an error
    // This prevents the error from being caught by the catch block in main()
    process.exit = vi.fn((code?: number) => {
      exitCode = code;
      // Don't throw - just return to simulate exit
      return undefined as never;
    }) as never;

    consoleOutput = [];
    consoleErrors = [];
    console.log = vi.fn((...args: unknown[]) => {
      consoleOutput.push(args.join(' '));
    });
    console.error = vi.fn((...args: unknown[]) => {
      consoleErrors.push(args.join(' '));
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('loadConfigFromEnvironment', () => {
    it('should load configuration from environment variables', () => {
      process.env.BRANCH_NAME = 'feature-test';
      process.env.SPEC_PATH = '.kiro/specs/feature-test';
      process.env.ENVIRONMENT = 'test';
      process.env.SPEC_TASK_ID = 'task-123';
      process.env.CODEBUILD_BUILD_ID = 'build-456';
      process.env.COVERAGE_THRESHOLD = '85';

      const config = loadConfigFromEnvironment();

      expect(config.branchName).toBe('feature-test');
      expect(config.specPath).toBe('.kiro/specs/feature-test');
      expect(config.environment).toBe('test');
      expect(config.taskId).toBe('task-123');
      expect(config.buildId).toBe('build-456');
      expect(config.coverageThreshold).toBe(85);
    });

    it('should use default values for optional environment variables', () => {
      process.env.BRANCH_NAME = 'feature-test';
      process.env.SPEC_PATH = '.kiro/specs/feature-test';
      process.env.ENVIRONMENT = 'test';

      const config = loadConfigFromEnvironment();

      expect(config.targetBranch).toBe('main');
      expect(config.coverageThreshold).toBe(80);
      expect(config.timeout).toBe(3600000);
      expect(config.awsRegion).toBe('us-east-1');
    });

    it('should throw error when required environment variables are missing', () => {
      delete process.env.BRANCH_NAME;
      delete process.env.SPEC_PATH;
      delete process.env.ENVIRONMENT;

      expect(() => loadConfigFromEnvironment()).toThrow('Missing required environment variables');
    });
  });

  describe('main execution', () => {
    beforeEach(() => {
      process.env.BRANCH_NAME = 'feature-test';
      process.env.SPEC_PATH = '.kiro/specs/feature-test';
      process.env.ENVIRONMENT = 'test';
      
      // Reset the mock before each test
      vi.mocked(KiroWorker).mockClear();
    });

    it('should exit with code 0 on successful execution', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        success: true,
        buildId: 'build-123',
        environment: 'test',
        branchName: 'feature-test',
        phases: [],
        duration: 5000,
        errors: []
      } as WorkerResult);

      // Mock the KiroWorker constructor
      vi.mocked(KiroWorker).mockImplementation(() => ({
        execute: mockExecute
      } as any));

      await main();

      expect(mockExecute).toHaveBeenCalled();
      expect(exitCode).toBe(0);
    });

    it('should exit with code 1 on execution failure', async () => {
      const mockExecute = vi.fn().mockRejectedValue(
        new Error('Pipeline execution failed')
      );

      // Mock the KiroWorker constructor
      vi.mocked(KiroWorker).mockImplementation(() => ({
        execute: mockExecute
      } as any));

      await main();

      expect(exitCode).toBe(1);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should handle configuration loading errors', async () => {
      delete process.env.BRANCH_NAME;
      delete process.env.SPEC_PATH;
      delete process.env.ENVIRONMENT;

      await main();

      expect(exitCode).toBe(1);
      // Check for the actual error message format from CLI
      expect(consoleErrors.some(err => err.includes('Missing required environment variables'))).toBe(true);
    });
  });
});
