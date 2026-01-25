/**
 * Error thrown when Kiro CLI execution fails
 */

export class KiroCLIError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode?: number,
    public readonly output?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'KiroCLIError';
    
    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KiroCLIError);
    }
  }
}
