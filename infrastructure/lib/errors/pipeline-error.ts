/**
 * Pipeline Error
 * 
 * Custom error for pipeline-related failures.
 * Includes stage information and optional cause.
 */

/**
 * Pipeline Error
 * 
 * Thrown when a pipeline stage fails.
 */
export class PipelineError extends Error {
  /**
   * Pipeline stage where error occurred
   */
  public readonly stage: string;
  
  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error;
  
  /**
   * Create a new Pipeline Error
   * 
   * @param message - Error message
   * @param stage - Pipeline stage where error occurred
   * @param cause - Original error that caused this error
   */
  constructor(message: string, stage: string, cause?: Error) {
    super(message);
    this.name = 'PipelineError';
    this.stage = stage;
    this.cause = cause;
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PipelineError);
    }
  }
}
