/**
 * Test Runner and Coverage Analyzer Component
 * 
 * Executes test suites and validates code coverage meets threshold requirements.
 * Supports configurable test commands and coverage analysis.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { TestResult, TestFailure, CoverageResult, TestConfig } from '../types';
import { TestExecutionError, CoverageThresholdError } from '../errors';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Interface for test execution and coverage analysis
 */
export interface TestRunner {
  runTests(config: TestConfig): Promise<TestResult>;
  analyzeCoverage(): Promise<CoverageResult>;
  generateTestSummary(): Promise<string>;
}

/**
 * Implementation of TestRunner for executing tests and analyzing coverage
 */
export class TestRunnerImpl implements TestRunner {
  private readonly repoPath: string;
  private testResult: TestResult | null = null;
  private coverageResult: CoverageResult | null = null;

  /**
   * Creates a new TestRunner instance
   * 
   * @param repoPath - Path to the repository root
   */
  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Executes the test suite with the provided configuration
   * 
   * @param config - Test configuration including commands and thresholds
   * @returns Test execution results
   * @throws {TestExecutionError} If test execution fails
   */
  async runTests(config: TestConfig): Promise<TestResult> {
    const testCommand = config.testCommand || 'npm test';
    
    logger.info('Running tests', {
      command: testCommand,
      repoPath: this.repoPath
    });

    try {
      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large test outputs
        env: {
          ...process.env,
          CI: 'true', // Ensure tests run in CI mode
          NODE_ENV: 'test'
        }
      });

      const output = stdout + stderr;
      const testResult = this.parseTestOutput(output);
      
      this.testResult = testResult;

      logger.info('Tests completed', {
        passed: testResult.passed,
        totalTests: testResult.totalTests,
        passedTests: testResult.passedTests,
        failedTests: testResult.failedTests
      });

      // Throw error if tests failed
      if (!testResult.passed) {
        throw new TestExecutionError(
          `Test execution failed: ${testResult.failedTests} of ${testResult.totalTests} tests failed`,
          testResult
        );
      }

      return testResult;
    } catch (error: unknown) {
      // If it's already a TestExecutionError, rethrow it
      if (error instanceof TestExecutionError) {
        throw error;
      }

      // Test command failed - parse output to extract test results
      const execError = error as { stdout?: string; stderr?: string; message: string };
      const output = (execError.stdout || '') + (execError.stderr || '');
      
      const testResult = this.parseTestOutput(output);
      this.testResult = testResult;

      logger.error('Test execution failed', {
        failedTests: testResult.failedTests,
        totalTests: testResult.totalTests
      });

      throw new TestExecutionError(
        `Test execution failed: ${testResult.failedTests} of ${testResult.totalTests} tests failed`,
        testResult
      );
    }
  }

  /**
   * Analyzes code coverage from coverage reports
   * 
   * @returns Coverage analysis results
   * @throws {CoverageThresholdError} If coverage is below threshold
   */
  async analyzeCoverage(): Promise<CoverageResult> {
    logger.info('Analyzing code coverage', {
      repoPath: this.repoPath
    });

    try {
      // Read coverage summary from Istanbul/NYC JSON report
      const coveragePath = `${this.repoPath}/coverage/coverage-summary.json`;
      const coverageData = await readFile(coveragePath, 'utf-8');
      const coverageJson = JSON.parse(coverageData);

      const coverageResult = this.parseCoverageReport(coverageJson);
      this.coverageResult = coverageResult;

      logger.info('Coverage analysis completed', {
        percentage: coverageResult.percentage,
        meetsThreshold: coverageResult.meetsThreshold,
        lines: coverageResult.lines,
        functions: coverageResult.functions,
        branches: coverageResult.branches,
        statements: coverageResult.statements
      });

      return coverageResult;
    } catch (error: unknown) {
      // If it's a CoverageThresholdError, rethrow it as-is
      if (error instanceof CoverageThresholdError) {
        throw error;
      }

      const err = error as Error;
      logger.error('Coverage analysis failed', {
        error: err.message
      });

      throw new TestExecutionError(
        `Failed to analyze coverage: ${err.message}`,
        this.testResult || this.createEmptyTestResult()
      );
    }
  }

  /**
   * Generates a human-readable test summary
   * 
   * @returns Formatted test summary string
   */
  async generateTestSummary(): Promise<string> {
    const lines: string[] = [];

    lines.push('## Test Results Summary\n');

    // Test execution summary
    if (this.testResult) {
      lines.push('### Test Execution');
      lines.push(`- **Status**: ${this.testResult.passed ? '✅ PASSED' : '❌ FAILED'}`);
      lines.push(`- **Total Tests**: ${this.testResult.totalTests}`);
      lines.push(`- **Passed**: ${this.testResult.passedTests}`);
      lines.push(`- **Failed**: ${this.testResult.failedTests}`);

      if (this.testResult.failures.length > 0) {
        lines.push('\n### Failed Tests');
        this.testResult.failures.forEach((failure, index) => {
          lines.push(`\n${index + 1}. **${failure.testName}**`);
          lines.push(`   - Error: ${failure.error}`);
          if (failure.stackTrace) {
            lines.push('   - Stack Trace:');
            lines.push('   ```');
            lines.push(failure.stackTrace.split('\n').map(line => `   ${line}`).join('\n'));
            lines.push('   ```');
          }
        });
      }
    } else {
      lines.push('### Test Execution');
      lines.push('- **Status**: ⚠️ NOT RUN');
    }

    // Coverage summary
    if (this.coverageResult) {
      lines.push('\n### Code Coverage');
      lines.push(`- **Overall**: ${this.coverageResult.percentage.toFixed(2)}%`);
      lines.push(`- **Threshold**: ${this.coverageResult.meetsThreshold ? '✅ MET' : '❌ NOT MET'}`);
      lines.push(`- **Lines**: ${this.coverageResult.lines.toFixed(2)}%`);
      lines.push(`- **Functions**: ${this.coverageResult.functions.toFixed(2)}%`);
      lines.push(`- **Branches**: ${this.coverageResult.branches.toFixed(2)}%`);
      lines.push(`- **Statements**: ${this.coverageResult.statements.toFixed(2)}%`);

      // File-by-file coverage (top 10 lowest coverage files)
      if (this.coverageResult.coverageByFile.size > 0) {
        const sortedFiles = Array.from(this.coverageResult.coverageByFile.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, 10);

        if (sortedFiles.length > 0) {
          lines.push('\n### Files with Lowest Coverage');
          sortedFiles.forEach(([file, coverage]) => {
            lines.push(`- ${file}: ${coverage.toFixed(2)}%`);
          });
        }
      }
    } else {
      lines.push('\n### Code Coverage');
      lines.push('- **Status**: ⚠️ NOT ANALYZED');
    }

    return lines.join('\n');
  }

  /**
   * Parses test output to extract test results
   * 
   * @param output - Raw test output from test command
   * @returns Parsed test results
   */
  private parseTestOutput(output: string): TestResult {
    // Parse Vitest output format
    const failures: TestFailure[] = [];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    // Extract test counts from Vitest output
    // Format: "Test Files  X passed | Y failed (Z)"
    const testFilesMatch = output.match(/Test Files\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?/i);
    if (testFilesMatch) {
      const passed = parseInt(testFilesMatch[1], 10);
      const failed = testFilesMatch[2] ? parseInt(testFilesMatch[2], 10) : 0;
      // This is file count, not test count
    }

    // Format: "Tests  X passed | Y failed (Z total)"
    const testsMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?\s+\((\d+)\s+total\)/i);
    if (testsMatch) {
      passedTests = parseInt(testsMatch[1], 10);
      failedTests = testsMatch[2] ? parseInt(testsMatch[2], 10) : 0;
      totalTests = parseInt(testsMatch[3], 10);
    } else {
      // Alternative format: "Tests  X passed (Y)"
      const altMatch = output.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/i);
      if (altMatch) {
        passedTests = parseInt(altMatch[1], 10);
        totalTests = parseInt(altMatch[2], 10);
        failedTests = totalTests - passedTests;
      }
    }

    // Parse individual test failures
    // Format: "❯ describe block > test name"
    const failurePattern = /❯\s+(.+?)\n\s+(.+?)\n(?:\s+(.+?)\n)?/g;
    let match;
    while ((match = failurePattern.exec(output)) !== null) {
      const testName = match[1].trim();
      const error = match[2].trim();
      const stackTrace = match[3] ? match[3].trim() : '';

      // Only add if it looks like a real failure (contains error keywords)
      if (error.toLowerCase().includes('error') || 
          error.toLowerCase().includes('expected') ||
          error.toLowerCase().includes('failed')) {
        failures.push({
          testName,
          error,
          stackTrace
        });
      }
    }

    // If we couldn't parse test counts but have failures, estimate
    if (totalTests === 0 && failures.length > 0) {
      failedTests = failures.length;
      totalTests = failures.length;
      passedTests = 0;
    }

    // Determine if tests passed: must have tests and no failures
    const passed = totalTests > 0 && failedTests === 0;

    return {
      passed,
      totalTests,
      passedTests,
      failedTests,
      output,
      failures
    };
  }

  /**
   * Parses coverage report JSON to extract coverage metrics
   * 
   * @param coverageJson - Parsed coverage JSON from Istanbul/NYC
   * @returns Parsed coverage results
   */
  private parseCoverageReport(coverageJson: any): CoverageResult {
    const total = coverageJson.total;

    if (!total) {
      throw new Error('Invalid coverage report format: missing total section');
    }

    // Extract coverage percentages for each metric
    const lines = total.lines?.pct ?? 0;
    const functions = total.functions?.pct ?? 0;
    const branches = total.branches?.pct ?? 0;
    const statements = total.statements?.pct ?? 0;

    // Calculate overall percentage (average of all metrics)
    const percentage = (lines + functions + branches + statements) / 4;

    // Check if all metrics meet the 80% threshold
    const meetsThreshold = lines >= 80 && 
                          functions >= 80 && 
                          branches >= 80 && 
                          statements >= 80;

    // Extract per-file coverage
    const coverageByFile = new Map<string, number>();
    for (const [filePath, fileData] of Object.entries(coverageJson)) {
      if (filePath !== 'total' && typeof fileData === 'object') {
        const fileTotal = (fileData as any).lines?.pct ?? 0;
        coverageByFile.set(filePath, fileTotal);
      }
    }

    // Generate summary text
    const summary = this.generateCoverageSummary(
      percentage,
      lines,
      functions,
      branches,
      statements,
      meetsThreshold
    );

    const result: CoverageResult = {
      percentage,
      meetsThreshold,
      coverageByFile,
      summary,
      lines,
      functions,
      branches,
      statements
    };

    // Throw error if coverage doesn't meet threshold
    if (!meetsThreshold) {
      throw new CoverageThresholdError(
        `Code coverage below 80% threshold: ${percentage.toFixed(2)}%`,
        result
      );
    }

    return result;
  }

  /**
   * Generates a coverage summary string
   * 
   * @param percentage - Overall coverage percentage
   * @param lines - Lines coverage percentage
   * @param functions - Functions coverage percentage
   * @param branches - Branches coverage percentage
   * @param statements - Statements coverage percentage
   * @param meetsThreshold - Whether coverage meets threshold
   * @returns Formatted coverage summary
   */
  private generateCoverageSummary(
    percentage: number,
    lines: number,
    functions: number,
    branches: number,
    statements: number,
    meetsThreshold: boolean
  ): string {
    const status = meetsThreshold ? 'PASSED' : 'FAILED';
    return `Coverage ${status}: ${percentage.toFixed(2)}% (Lines: ${lines.toFixed(2)}%, Functions: ${functions.toFixed(2)}%, Branches: ${branches.toFixed(2)}%, Statements: ${statements.toFixed(2)}%)`;
  }

  /**
   * Creates an empty test result for error cases
   * 
   * @returns Empty test result
   */
  private createEmptyTestResult(): TestResult {
    return {
      passed: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      output: '',
      failures: []
    };
  }
}
