/**
 * Notification Service
 * 
 * Sends notifications for deployment and rollback events via SNS.
 * All notifications are formatted as JSON with consistent structure.
 * 
 * Notification Types:
 * - Deployment Start
 * - Deployment Success
 * - Deployment Failure
 * - Rollback Initiated
 * - Rollback Success
 * - Rollback Failure
 */

import {
  SNSClient,
  PublishCommand,
  PublishCommandInput,
} from '@aws-sdk/client-sns';

/**
 * Deployment event data
 */
export interface DeploymentEvent {
  /** Deployment ID */
  deploymentId: string;
  
  /** Environment (test, staging, production) */
  environment: string;
  
  /** Version being deployed */
  version: string;
  
  /** Pipeline execution ID */
  executionId: string;
  
  /** Additional event-specific data */
  data?: Record<string, any>;
}

/**
 * Rollback event data
 */
export interface RollbackEvent {
  /** Deployment ID being rolled back */
  deploymentId: string;
  
  /** Environment (test, staging, production) */
  environment: string;
  
  /** Current version */
  currentVersion: string;
  
  /** Target version (for rollback) */
  targetVersion?: string;
  
  /** Rollback level (stage, full) */
  level?: string;
  
  /** Reason for rollback */
  reason?: string;
  
  /** Additional event-specific data */
  data?: Record<string, any>;
}

/**
 * Notification Service configuration
 */
export interface NotificationServiceConfig {
  /** SNS topic ARN for notifications */
  topicArn: string;
  
  /** AWS region */
  region?: string;
}

/**
 * Notification Service
 * 
 * Sends structured notifications for deployment and rollback events.
 * Handles errors gracefully to avoid failing deployments due to notification issues.
 */
export class NotificationService {
  private readonly sns: SNSClient;
  private readonly topicArn: string;
  
  /**
   * Create a new Notification Service
   * 
   * @param config - Notification service configuration
   */
  constructor(config: NotificationServiceConfig) {
    const region = config.region || 'us-east-1';
    
    this.sns = new SNSClient({ region });
    this.topicArn = config.topicArn;
  }
  
  /**
   * Notify deployment start
   * 
   * Sends notification when a deployment begins.
   * 
   * @param event - Deployment event data
   * @returns Promise that resolves when notification is sent
   */
  async notifyDeploymentStart(event: DeploymentEvent): Promise<void> {
    const message = {
      eventType: 'deployment_start',
      timestamp: new Date().toISOString(),
      deploymentId: event.deploymentId,
      environment: event.environment,
      version: event.version,
      executionId: event.executionId,
      ...event.data,
    };
    
    await this.publish(
      `Deployment Started - ${event.environment}`,
      message
    );
  }
  
  /**
   * Notify deployment success
   * 
   * Sends notification when a deployment completes successfully.
   * 
   * @param event - Deployment event data
   * @returns Promise that resolves when notification is sent
   */
  async notifyDeploymentSuccess(event: DeploymentEvent): Promise<void> {
    const message = {
      eventType: 'deployment_success',
      timestamp: new Date().toISOString(),
      deploymentId: event.deploymentId,
      environment: event.environment,
      version: event.version,
      executionId: event.executionId,
      ...event.data,
    };
    
    await this.publish(
      `Deployment Succeeded - ${event.environment}`,
      message
    );
  }
  
  /**
   * Notify deployment failure
   * 
   * Sends notification when a deployment fails.
   * 
   * @param event - Deployment event data
   * @returns Promise that resolves when notification is sent
   */
  async notifyDeploymentFailure(event: DeploymentEvent): Promise<void> {
    const message = {
      eventType: 'deployment_failure',
      timestamp: new Date().toISOString(),
      deploymentId: event.deploymentId,
      environment: event.environment,
      version: event.version,
      executionId: event.executionId,
      ...event.data,
    };
    
    await this.publish(
      `Deployment Failed - ${event.environment}`,
      message
    );
  }
  
  /**
   * Notify rollback initiated
   * 
   * Sends notification when a rollback is initiated.
   * 
   * @param event - Rollback event data
   * @returns Promise that resolves when notification is sent
   */
  async notifyRollbackInitiated(event: RollbackEvent): Promise<void> {
    const message = {
      eventType: 'rollback_initiated',
      timestamp: new Date().toISOString(),
      deploymentId: event.deploymentId,
      environment: event.environment,
      currentVersion: event.currentVersion,
      targetVersion: event.targetVersion || 'unknown',
      reason: event.reason || 'unknown',
      ...event.data,
    };
    
    await this.publish(
      `Rollback Initiated - ${event.environment}`,
      message
    );
  }
  
  /**
   * Notify rollback success
   * 
   * Sends notification when a rollback completes successfully.
   * 
   * @param event - Rollback event data
   * @returns Promise that resolves when notification is sent
   */
  async notifyRollbackSuccess(event: RollbackEvent): Promise<void> {
    const message = {
      eventType: 'rollback_success',
      timestamp: new Date().toISOString(),
      deploymentId: event.deploymentId,
      environment: event.environment,
      currentVersion: event.currentVersion,
      targetVersion: event.targetVersion || 'unknown',
      level: event.level || 'unknown',
      ...event.data,
    };
    
    await this.publish(
      `Rollback Succeeded - ${event.environment}`,
      message
    );
  }
  
  /**
   * Notify rollback failure
   * 
   * Sends notification when a rollback fails.
   * 
   * @param event - Rollback event data
   * @returns Promise that resolves when notification is sent
   */
  async notifyRollbackFailure(event: RollbackEvent): Promise<void> {
    const message = {
      eventType: 'rollback_failure',
      timestamp: new Date().toISOString(),
      deploymentId: event.deploymentId,
      environment: event.environment,
      currentVersion: event.currentVersion,
      reason: event.reason || 'unknown',
      ...event.data,
    };
    
    await this.publish(
      `Rollback Failed - ${event.environment}`,
      message
    );
  }
  
  /**
   * Publish message to SNS topic
   * 
   * Handles errors gracefully to avoid failing deployments due to notification issues.
   * 
   * @param subject - Message subject
   * @param message - Message body (will be JSON stringified)
   */
  private async publish(subject: string, message: Record<string, any>): Promise<void> {
    try {
      const input: PublishCommandInput = {
        TopicArn: this.topicArn,
        Subject: subject,
        Message: JSON.stringify(message, null, 2),
      };
      
      const command = new PublishCommand(input);
      await this.sns.send(command);
      
      this.log('info', 'Notification sent', {
        subject,
        eventType: message.eventType,
      });
    } catch (error) {
      // Log error but don't throw - notifications should not fail deployments
      this.log('error', 'Failed to send notification', {
        subject,
        eventType: message.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Structured logging
   * 
   * Outputs JSON-formatted log messages with timestamp, level, and context.
   * 
   * @param level - Log level (info, error)
   * @param message - Log message
   * @param context - Additional context data
   */
  private log(
    level: 'info' | 'error',
    message: string,
    context?: Record<string, any>
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: 'NotificationService',
      ...context,
    };
    
    console.log(JSON.stringify(logEntry));
  }
}
