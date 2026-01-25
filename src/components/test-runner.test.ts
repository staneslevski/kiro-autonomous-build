import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestRunnerImpl } from './test-runner';
import { TestExecutionError, CoverageThresholdError } from '../errors';
import { exec } from 'child_process';
import { readFile } from 'fs/promises';

// Mock child_process and fs/promises
vi.mock('child_process');
vi.mock('fs/promises');

describe('TestRunnerImpl', () => {
  let testRunner: TestRunnerImpl;
  const repoPath = '/test/repo';

  beforeEach(() => {
    testRunner = new TestRunnerImpl(repoPath);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runTests', () => {
    it('should execute tests successfully with default command', async () => {
      const mockOutput = `
Test Files  1 passed (1)
     Tests  10 passed (10)
  Start at  12:00:00
  Duration  1.23s
`;

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      });

      const config = { coverageThreshold: 80 };
      const result = await testRunner.runTests(config);

      expect(result.passed).toBe(true);
      expect(result.totalTests).toBe(10);
      expect(result.passedTests).toBe(10);
      expect(result.failedTests).toBe(0);
      expect(result.failures).toHaveLength(0);
    });

    it('should execute tests with custom test command', async () => {
      const mockOutput = `
Test Files  1 passed (1)
     Tests  5 passed (5)
`;

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        expect(command).toBe('yarn test');
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      });

      const config = { 
        testCommand: 'yarn test',
        coverageThreshold: 80 
      };
      const result = await testRunner.runTests(config);

      expect(result.passed).toBe(true);
      expect(result.totalTests).toBe(5);
    });

    it('should handle test failures', async () => {
      const mockOutput = `
Test Files  1 failed (1)
     Tests  2 passed | 3 failed (5 total)
  Start at  12:00:00
  Duration  1.23s

❯ TestSuite > should do something
  Error: Expected true to be false
  at /test/file.ts:10:5

❯ TestSuite > should do another thing
  Error: Assertion failed
  at /test/file.ts:20:5
`;

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        const error: any = new Error('Command failed');
        error.stdout = mockOutput;
        error.stderr = '';
        callback(error);
        return {} as any;
      });

      const config = { coverageThreshold: 80 };

      await expect(testRunner.runTests(config)).rejects.toThrow(TestExecutionError);

      try {
        await testRunner.runTests(config);
      } catch (error) {
        expect(error).toBeInstanceOf(TestExecutionError);
        const testError = error as TestExecutionError;
        expect(testError.testResult.passed).toBe(false);
        expect(testError.testResult.totalTests).toBe(5);
        expect(testError.testResult.passedTests).toBe(2);
        expect(testError.testResult.failedTests).toBe(3);
      }
    });

    it('should parse test output with alternative format', async () => {
      const mockOutput = `
Tests  15 passed (15)
Duration  2.5s
`;

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      });

      const config = { coverageThreshold: 80 };
      const result = await testRunner.runTests(config);

      expect(result.passed).toBe(true);
      expect(result.totalTests).toBe(15);
      expect(result.passedTests).toBe(15);
      expect(result.failedTests).toBe(0);
    });

    it('should handle execution errors', async () => {
      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        const error: any = new Error('Command not found');
        error.stdout = '';
        error.stderr = 'npm: command not found';
        callback(error);
        return {} as any;
      });

      const config = { coverageThreshold: 80 };

      await expect(testRunner.runTests(config)).rejects.toThrow(TestExecutionError);
    });

    it('should set CI environment variables', async () => {
      const mockOutput = 'Tests  1 passed (1)';

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        expect(options.env.CI).toBe('true');
        expect(options.env.NODE_ENV).toBe('test');
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      });

      const config = { coverageThreshold: 80 };
      await testRunner.runTests(config);
    });

    it('should use correct working directory', async () => {
      const mockOutput = 'Tests  1 passed (1)';

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        expect(options.cwd).toBe(repoPath);
        callback(null, { stdout: mockOutput, stderr: '' });
        return {} as any;
      });

      const config = { coverageThreshold: 80 };
      await testRunner.runTests(config);
    });

    it('should capture both stdout and stderr', async () => {
      const stdout = 'Tests  1 passed (1)';
      const stderr = 'Warning: deprecated API';

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout, stderr });
        return {} as any;
      });

      const config = { coverageThreshold: 80 };
      const result = await testRunner.runTests(config);

      expect(result.output).toContain(stdout);
      expect(result.output).toContain(stderr);
    });
  });

  describe('analyzeCoverage', () => {
    it('should analyze coverage successfully when above threshold', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 85.5 },
          functions: { pct: 90.0 },
          branches: { pct: 82.3 },
          statements: { pct: 86.7 }
        },
        'src/file1.ts': {
          lines: { pct: 80.0 }
        },
        'src/file2.ts': {
          lines: { pct: 90.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      const result = await testRunner.analyzeCoverage();

      expect(result.percentage).toBeCloseTo(86.125, 2);
      expect(result.meetsThreshold).toBe(true);
      expect(result.lines).toBe(85.5);
      expect(result.functions).toBe(90.0);
      expect(result.branches).toBe(82.3);
      expect(result.statements).toBe(86.7);
      expect(result.coverageByFile.size).toBe(2);
      expect(result.coverageByFile.get('src/file1.ts')).toBe(80.0);
      expect(result.coverageByFile.get('src/file2.ts')).toBe(90.0);
    });

    it('should throw CoverageThresholdError when below threshold', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 75.0 },
          functions: { pct: 80.0 },
          branches: { pct: 70.0 },
          statements: { pct: 78.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await expect(testRunner.analyzeCoverage()).rejects.toThrow(CoverageThresholdError);

      try {
        await testRunner.analyzeCoverage();
      } catch (error) {
        expect(error).toBeInstanceOf(CoverageThresholdError);
        const coverageError = error as CoverageThresholdError;
        expect(coverageError.coverageResult.meetsThreshold).toBe(false);
        expect(coverageError.coverageResult.lines).toBe(75.0);
      }
    });

    it('should throw error when coverage file not found', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: file not found'));

      await expect(testRunner.analyzeCoverage()).rejects.toThrow(TestExecutionError);
    });

    it('should throw error when coverage JSON is invalid', async () => {
      vi.mocked(readFile).mockResolvedValue('invalid json');

      await expect(testRunner.analyzeCoverage()).rejects.toThrow();
    });

    it('should throw error when coverage format is invalid', async () => {
      const mockCoverage = {
        // Missing 'total' section
        'src/file1.ts': {
          lines: { pct: 80.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await expect(testRunner.analyzeCoverage()).rejects.toThrow(TestExecutionError);
    });

    it('should handle missing coverage metrics gracefully', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 85.0 },
          // Missing functions, branches, statements
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      const result = await testRunner.analyzeCoverage();

      expect(result.lines).toBe(85.0);
      expect(result.functions).toBe(0);
      expect(result.branches).toBe(0);
      expect(result.statements).toBe(0);
      expect(result.meetsThreshold).toBe(false); // Missing metrics default to 0
    });

    it('should read coverage from correct path', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 85.0 },
          functions: { pct: 85.0 },
          branches: { pct: 85.0 },
          statements: { pct: 85.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await testRunner.analyzeCoverage();

      expect(readFile).toHaveBeenCalledWith(
        `${repoPath}/coverage/coverage-summary.json`,
        'utf-8'
      );
    });

    it('should calculate overall percentage as average of all metrics', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 80.0 },
          functions: { pct: 84.0 },
          branches: { pct: 88.0 },
          statements: { pct: 92.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      const result = await testRunner.analyzeCoverage();

      // (80 + 84 + 88 + 92) / 4 = 86
      expect(result.percentage).toBe(86.0);
    });
  });

  describe('generateTestSummary', () => {
    it('should generate summary with test results and coverage', async () => {
      // Run tests first
      const mockTestOutput = 'Tests  10 passed (10)';
      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout: mockTestOutput, stderr: '' });
        return {} as any;
      });

      const mockCoverage = {
        total: {
          lines: { pct: 85.5 },
          functions: { pct: 90.0 },
          branches: { pct: 82.3 },
          statements: { pct: 86.7 }
        }
      };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await testRunner.runTests({ coverageThreshold: 80 });
      await testRunner.analyzeCoverage();

      const summary = await testRunner.generateTestSummary();

      expect(summary).toContain('Test Results Summary');
      expect(summary).toContain('✅ PASSED');
      expect(summary).toContain('Total Tests**: 10');
      expect(summary).toContain('Passed**: 10');
      expect(summary).toContain('Failed**: 0');
      expect(summary).toContain('Code Coverage');
      expect(summary).toContain('86.12%');
      expect(summary).toContain('✅ MET');
      expect(summary).toContain('Lines**: 85.50%');
      expect(summary).toContain('Functions**: 90.00%');
      expect(summary).toContain('Branches**: 82.30%');
      expect(summary).toContain('Statements**: 86.70%');
    });

    it('should generate summary with failed tests', async () => {
      const mockTestOutput = `
Tests  2 passed | 3 failed (5 total)

❯ TestSuite > should fail
  Error: Expected true to be false
  at /test/file.ts:10:5
`;

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        const error: any = new Error('Command failed');
        error.stdout = mockTestOutput;
        error.stderr = '';
        callback(error);
        return {} as any;
      });

      try {
        await testRunner.runTests({ coverageThreshold: 80 });
      } catch {
        // Expected to fail
      }

      const summary = await testRunner.generateTestSummary();

      expect(summary).toContain('❌ FAILED');
      expect(summary).toContain('Total Tests**: 5');
      expect(summary).toContain('Passed**: 2');
      expect(summary).toContain('Failed**: 3');
      expect(summary).toContain('Failed Tests');
    });

    it('should generate summary when tests not run', async () => {
      const summary = await testRunner.generateTestSummary();

      expect(summary).toContain('Test Results Summary');
      expect(summary).toContain('⚠️ NOT RUN');
      expect(summary).toContain('⚠️ NOT ANALYZED');
    });

    it('should include file-by-file coverage for lowest coverage files', async () => {
      const mockTestOutput = 'Tests  1 passed (1)';
      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout: mockTestOutput, stderr: '' });
        return {} as any;
      });

      const mockCoverage = {
        total: {
          lines: { pct: 85.0 },
          functions: { pct: 85.0 },
          branches: { pct: 85.0 },
          statements: { pct: 85.0 }
        },
        'src/file1.ts': { lines: { pct: 60.0 } },
        'src/file2.ts': { lines: { pct: 95.0 } },
        'src/file3.ts': { lines: { pct: 70.0 } }
      };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await testRunner.runTests({ coverageThreshold: 80 });
      await testRunner.analyzeCoverage();

      const summary = await testRunner.generateTestSummary();

      expect(summary).toContain('Files with Lowest Coverage');
      expect(summary).toContain('src/file1.ts: 60.00%');
      expect(summary).toContain('src/file3.ts: 70.00%');
      expect(summary).toContain('src/file2.ts: 95.00%');
    });

    it('should limit file list to top 10 lowest coverage files', async () => {
      const mockTestOutput = 'Tests  1 passed (1)';
      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout: mockTestOutput, stderr: '' });
        return {} as any;
      });

      const mockCoverage: any = {
        total: {
          lines: { pct: 85.0 },
          functions: { pct: 85.0 },
          branches: { pct: 85.0 },
          statements: { pct: 85.0 }
        }
      };

      // Add 15 files with varying coverage
      for (let i = 1; i <= 15; i++) {
        mockCoverage[`src/file${i}.ts`] = { lines: { pct: 50 + i } };
      }

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await testRunner.runTests({ coverageThreshold: 80 });
      await testRunner.analyzeCoverage();

      const summary = await testRunner.generateTestSummary();

      // Should only show 10 files
      const fileMatches = summary.match(/src\/file\d+\.ts/g);
      expect(fileMatches).toBeTruthy();
      expect(fileMatches!.length).toBeLessThanOrEqual(10);
    });

    it('should include stack traces for failed tests', async () => {
      const mockTestOutput = `
Tests  0 passed | 1 failed (1 total)

❯ TestSuite > should fail
  Error: Assertion failed
  at Object.<anonymous> (/test/file.ts:10:5)
  at Promise.then.completed (/test/runner.ts:20:10)
`;

      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        const error: any = new Error('Command failed');
        error.stdout = mockTestOutput;
        error.stderr = '';
        callback(error);
        return {} as any;
      });

      try {
        await testRunner.runTests({ coverageThreshold: 80 });
      } catch {
        // Expected to fail
      }

      const summary = await testRunner.generateTestSummary();

      expect(summary).toContain('Stack Trace:');
      expect(summary).toContain('```');
    });
  });

  describe('edge cases', () => {
    it('should handle empty test output', async () => {
      vi.mocked(exec).mockImplementation((command: any, options: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const config = { coverageThreshold: 80 };
      const result = await testRunner.runTests(config);

      expect(result.totalTests).toBe(0);
      expect(result.passedTests).toBe(0);
      expect(result.failedTests).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should handle coverage with zero values', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 0 },
          functions: { pct: 0 },
          branches: { pct: 0 },
          statements: { pct: 0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await expect(testRunner.analyzeCoverage()).rejects.toThrow(CoverageThresholdError);
    });

    it('should handle coverage at exactly 80% threshold', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 80.0 },
          functions: { pct: 80.0 },
          branches: { pct: 80.0 },
          statements: { pct: 80.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      const result = await testRunner.analyzeCoverage();

      expect(result.meetsThreshold).toBe(true);
      expect(result.percentage).toBe(80.0);
    });

    it('should handle coverage just below 80% threshold', async () => {
      const mockCoverage = {
        total: {
          lines: { pct: 79.99 },
          functions: { pct: 80.0 },
          branches: { pct: 80.0 },
          statements: { pct: 80.0 }
        }
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockCoverage));

      await expect(testRunner.analyzeCoverage()).rejects.toThrow(CoverageThresholdError);
    });
  });
});
