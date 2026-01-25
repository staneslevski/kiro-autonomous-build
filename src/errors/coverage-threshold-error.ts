/**
 * Error thrown when code coverage is below threshold
 */

export class CoverageThresholdError extends Error {
  public readonly actualCoverage: number;
  public readonly threshold: number;
  public readonly cause?: Error;

  constructor(message: string, actualCoverage: number, threshold: number, cause?: Error) {
    super(message);
    this.name = 'CoverageThresholdError';
    this.actualCoverage = actualCoverage;
    this.threshold = threshold;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CoverageThresholdError);
    }
  }
}
