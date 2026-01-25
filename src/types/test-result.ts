/**
 * Test execution and coverage result types
 */

export interface TestResult {
  readonly passed: boolean;
  readonly totalTests: number;
  readonly passedTests: number;
  readonly failedTests: number;
  readonly output: string;
  readonly failures: TestFailure[];
}

export interface TestFailure {
  readonly testName: string;
  readonly error: string;
  readonly stackTrace: string;
}

export interface CoverageResult {
  readonly percentage: number;
  readonly meetsThreshold: boolean;
  readonly coverageByFile: Map<string, number>;
  readonly summary: string;
  readonly lines: number;
  readonly functions: number;
  readonly branches: number;
  readonly statements: number;
}

export interface ExecutionResult {
  readonly success: boolean;
  readonly output: string;
  readonly modifiedFiles: string[];
  readonly errors?: string[];
}
