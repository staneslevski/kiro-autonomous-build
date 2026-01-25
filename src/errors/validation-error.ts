/**
 * Error thrown when validation fails
 */

export class ValidationError extends Error {
  public readonly validationErrors: string[];
  public readonly cause?: Error;

  constructor(message: string, validationErrors: string[], cause?: Error) {
    super(message);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}
