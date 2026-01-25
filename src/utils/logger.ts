/**
 * Structured logging utility for CloudWatch Logs
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

class Logger {
  private readonly environment: string;

  constructor() {
    this.environment = process.env.ENVIRONMENT || 'development';
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('DEBUG', message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('INFO', message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('WARN', message, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorInfo = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : undefined;

    this.log('ERROR', message, context, errorInfo);
  }

  /**
   * Internal log method that outputs JSON format
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: { name: string; message: string; stack?: string }
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context: { ...context, environment: this.environment } }),
      ...(error && { error })
    };

    // Output as JSON for CloudWatch Logs
    console.log(JSON.stringify(entry));
  }
}

// Export singleton instance
export const logger = new Logger();
