/**
 * Error thrown when tests fail
 */

export class TestFailureError extends Error {
  public readonly failedCount: number;
  public readonly totalCount: number;
  public readonly cause?: Error;

  constructor(message: string, failedCount: number, totalCount: number, cause?: Error) {
    super(message);
    this.name = 'TestFailureError';
    this.failedCount = failedCount;
    this.totalCount = totalCount;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TestFailureError);
    }
  }
}
