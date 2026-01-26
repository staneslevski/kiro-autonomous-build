/**
 * CloudWatch Logs integration for Kiro Worker
 * 
 * Provides structured logging to AWS CloudWatch Logs with appropriate log levels
 */

import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogStreamCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { sanitizeForLogging } from './sanitize';
import { logger } from './logger';

export interface CloudWatchLoggerConfig {
  logGroupName: string;
  logStreamName: string;
  region?: string;
  enabled?: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  context?: Record<string, unknown>;
}

/**
 * CloudWatch Logger for sending logs to AWS CloudWatch Logs
 */
export class CloudWatchLogger {
  private readonly client: CloudWatchLogsClient;
  private readonly config: CloudWatchLoggerConfig;
  private sequenceToken: string | undefined;
  private logBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushInterval = 5000; // 5 seconds
  private readonly maxBufferSize = 100;

  constructor(config: CloudWatchLoggerConfig) {
    this.config = {
      enabled: true,
      region: process.env.AWS_REGION || 'us-east-1',
      ...config
    };

    this.client = new CloudWatchLogsClient({
      region: this.config.region
    });

    // Start auto-flush timer
    if (this.config.enabled) {
      this.startAutoFlush();
    }
  }

  /**
   * Log a debug message
   */
  async debug(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log('DEBUG', message, context);
  }

  /**
   * Log an info message
   */
  async info(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log('INFO', message, context);
  }

  /**
   * Log a warning message
   */
  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log('WARN', message, context);
  }

  /**
   * Log an error message
   */
  async error(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.log('ERROR', message, context);
  }

  /**
   * Log a message with specified level
   */
  private async log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Sanitize message and context
    const sanitizedMessage = sanitizeForLogging(message);
    const sanitizedContext = context ? this.sanitizeContext(context) : undefined;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: sanitizedMessage,
      context: sanitizedContext
    };

    this.logBuffer.push(entry);

    // Also log locally for immediate visibility
    logger[level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error'](sanitizedMessage, sanitizedContext);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Sanitize context object recursively
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeForLogging(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Flush buffered logs to CloudWatch
   */
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.config.enabled) {
      return;
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Ensure log stream exists
      await this.ensureLogStream();

      // Format log events
      const logEvents = logsToSend.map(entry => ({
        timestamp: entry.timestamp.getTime(),
        message: JSON.stringify({
          level: entry.level,
          message: entry.message,
          context: entry.context,
          timestamp: entry.timestamp.toISOString()
        })
      }));

      // Sort by timestamp (required by CloudWatch)
      logEvents.sort((a, b) => a.timestamp - b.timestamp);

      // Send to CloudWatch
      const command = new PutLogEventsCommand({
        logGroupName: this.config.logGroupName,
        logStreamName: this.config.logStreamName,
        logEvents,
        sequenceToken: this.sequenceToken
      });

      const response = await this.client.send(command);
      this.sequenceToken = response.nextSequenceToken;

      logger.debug('Flushed logs to CloudWatch', {
        count: logEvents.length,
        logGroup: this.config.logGroupName,
        logStream: this.config.logStreamName
      });
    } catch (error) {
      logger.error('Failed to flush logs to CloudWatch', {
        error: error instanceof Error ? error.message : String(error),
        logGroup: this.config.logGroupName,
        logStream: this.config.logStreamName,
        bufferedLogs: logsToSend.length
      });

      // Put logs back in buffer to retry
      this.logBuffer.unshift(...logsToSend);
    }
  }

  /**
   * Ensure log stream exists and get sequence token
   */
  private async ensureLogStream(): Promise<void> {
    if (this.sequenceToken !== undefined) {
      return;
    }

    try {
      // Check if log stream exists
      const describeCommand = new DescribeLogStreamsCommand({
        logGroupName: this.config.logGroupName,
        logStreamNamePrefix: this.config.logStreamName
      });

      const describeResponse = await this.client.send(describeCommand);
      const stream = describeResponse.logStreams?.find(s => s.logStreamName === this.config.logStreamName);

      if (stream) {
        this.sequenceToken = stream.uploadSequenceToken;
      } else {
        // Create log stream
        const createCommand = new CreateLogStreamCommand({
          logGroupName: this.config.logGroupName,
          logStreamName: this.config.logStreamName
        });

        await this.client.send(createCommand);
        this.sequenceToken = undefined; // First write doesn't need sequence token
      }
    } catch (error) {
      logger.warn('Failed to ensure log stream', {
        error: error instanceof Error ? error.message : String(error),
        logGroup: this.config.logGroupName,
        logStream: this.config.logStreamName
      });
      throw error;
    }
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        logger.error('Auto-flush failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }, this.flushInterval);
  }

  /**
   * Stop auto-flush timer and flush remaining logs
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }
}
