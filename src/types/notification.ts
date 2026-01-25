/**
 * Notification types for monitoring and alerting
 */

export interface Notification {
  readonly subject: string;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly context: NotificationContext;
}

export interface NotificationContext {
  readonly environment: string;
  readonly buildId?: string;
  readonly resourceArn?: string;
  readonly metricName?: string;
  readonly metricValue?: number;
  readonly threshold?: number;
  readonly timestamp: Date;
}
