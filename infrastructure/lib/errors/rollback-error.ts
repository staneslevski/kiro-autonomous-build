/**
 * Rollback Error
 * 
 * Custom error for rollback-related failures.
 * Includes deployment information and optional cause.
 */

/**
 * Rollback Error
 * 
 * Thrown when a rollback operation fails.
 */
export class RollbackError extends Error {
  /**
   * Deployment ID being rolled back
   */
  public readonly deployment: string;
  
  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error;
  
  /**
   * Create a new Rollback Error
   * 
   * @param message - Error message
   * @param deployment - Deployment ID being rolled back
   * @param cause - Original error that caused this error
   */
  constructor(message: string, deployment: string, cause?: Error) {
    super(message);
    this.name = 'RollbackError';
    this.deployment = deployment;
    this.cause = cause;
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RollbackError);
    }
  }
}
