/**
 * Security Scan Error
 * 
 * Custom error for security scan failures.
 * Includes violations information and optional cause.
 */

/**
 * Security violation
 */
export interface SecurityViolation {
  /** Rule that was violated */
  rule: string;
  
  /** Severity level */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** Resource that violated the rule */
  resource?: string;
  
  /** Description of the violation */
  description?: string;
}

/**
 * Security Scan Error
 * 
 * Thrown when security scans detect violations.
 */
export class SecurityScanError extends Error {
  /**
   * Array of security violations
   */
  public readonly violations: SecurityViolation[];
  
  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error;
  
  /**
   * Create a new Security Scan Error
   * 
   * @param message - Error message
   * @param violations - Array of security violations
   * @param cause - Original error that caused this error
   */
  constructor(message: string, violations: SecurityViolation[], cause?: Error) {
    super(message);
    this.name = 'SecurityScanError';
    this.violations = violations;
    this.cause = cause;
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityScanError);
    }
  }
}
