/**
 * Structured Logger
 * 
 * Provides structured logging with JSON output format.
 * All log entries include timestamp, level, message, and optional context.
 */

/**
 * Log level
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Log entry structure
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Log level */
  level: LogLevel;
  
  /** Log message */
  message: string;
  
  /** Component or module name */
  component?: string;
  
  /** Additional context data */
  [key: string]: any;
}

/**
 * Structured Logger
 * 
 * Outputs JSON-formatted log messages for structured logging systems.
 */
export class StructuredLogger {
  private readonly component?: string;
  
  /**
   * Create a new Structured Logger
   * 
   * @param component - Component or module name (optional)
   */
  constructor(component?: string) {
    this.component = component;
  }
  
  /**
   * Log a message with specified level
   * 
   * @param level - Log level
   * @param message - Log message
   * @param context - Additional context data
   */
  log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(this.component && { component: this.component }),
      ...context,
    };
    
    // Serialize errors properly
    if (context?.error instanceof Error) {
      entry.error = {
        name: context.error.name,
        message: context.error.message,
        stack: context.error.stack,
      };
    }
    
    console.log(JSON.stringify(entry));
  }
  
  /**
   * Log an info message
   * 
   * @param message - Log message
   * @param context - Additional context data
   */
  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }
  
  /**
   * Log a warning message
   * 
   * @param message - Log message
   * @param context - Additional context data
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }
  
  /**
   * Log an error message
   * 
   * @param message - Log message
   * @param context - Additional context data
   */
  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context);
  }
  
  /**
   * Log a debug message
   * 
   * @param message - Log message
   * @param context - Additional context data
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }
}
