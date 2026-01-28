/**
 * Health Check Error
 * 
 * Custom error for health check failures.
 * Includes failed alarms information and optional cause.
 */

/**
 * Health Check Error
 * 
 * Thrown when health checks fail.
 */
export class HealthCheckError extends Error {
  /**
   * Array of failed alarm names
   */
  public readonly failedAlarms: string[];
  
  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error;
  
  /**
   * Create a new Health Check Error
   * 
   * @param message - Error message
   * @param failedAlarms - Array of failed alarm names
   * @param cause - Original error that caused this error
   */
  constructor(message: string, failedAlarms: string[], cause?: Error) {
    super(message);
    this.name = 'HealthCheckError';
    this.failedAlarms = failedAlarms;
    this.cause = cause;
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HealthCheckError);
    }
  }
}
