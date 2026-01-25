/**
 * Error thrown when Git operations fail
 */

export class GitOperationError extends Error {
  public readonly operation: string;
  public readonly cause?: Error;

  constructor(message: string, operation: string, cause?: Error) {
    super(message);
    this.name = 'GitOperationError';
    this.operation = operation;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitOperationError);
    }
  }
}
