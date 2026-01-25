/**
 * Error thrown when pull request update fails
 */

export class PRUpdateError extends Error {
  public readonly prNumber?: number;
  public readonly cause?: Error;

  constructor(message: string, prNumber?: number, cause?: Error) {
    super(message);
    this.name = 'PRUpdateError';
    this.prNumber = prNumber;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PRUpdateError);
    }
  }
}
