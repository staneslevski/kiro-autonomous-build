/**
 * Error thrown when test execution fails
 */

import { TestResult } from '../types';

export class TestExecutionError extends Error {
  public readonly testResult: TestResult;

  constructor(message: string, testResult: TestResult) {
    super(message);
    this.name = 'TestExecutionError';
    this.testResult = testResult;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestExecutionError);
    }
  }
}
