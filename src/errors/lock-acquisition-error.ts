/**
 * Error thrown when lock acquisition fails
 */

export class LockAcquisitionError extends Error {
  public readonly lockKey: string;
  public readonly cause?: Error;

  constructor(message: string, lockKey: string, cause?: Error) {
    super(message);
    this.name = 'LockAcquisitionError';
    this.lockKey = lockKey;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LockAcquisitionError);
    }
  }
}
