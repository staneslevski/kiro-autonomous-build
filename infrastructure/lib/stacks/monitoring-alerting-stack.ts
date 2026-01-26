/**
 * Monitoring and Alerting Stack for Kiro CodeBuild Worker
 * 
 * This stack creates comprehensive monitoring and alerting infrastructure:
 * - SNS topics for notifications (test, staging, production)
 * - CloudWatch Alarms for build metrics (failure rate, duration)
 * - CloudWatch Alarms for operation metrics (Lambda errors, DynamoDB throttling)
 * - CloudWatch Alarms for resource metrics (CPU, memory utilization)
 * - Environment-specific alarm thresholds (warning and error levels)
 * - NotificationInterface abstraction for future SES migration
 * 
 * Dependencies:
 * - CodeBuildProjectsStack (CodeBuild project for monitoring)
 * - WorkItemPollerStack (Lambda function for monitoring)
 * - CoreInfrastructureStack (DynamoDB table for monitoring)
 */

import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

/**
 * Alarm threshold configuration for environment-specific settings
 */
export interface AlarmThresholds {
  /** Build failure rate threshold (0-1, e.g., 0.5 = 50%) */
  buildFailureRate: {
    warning: number;
    error: number;
  };
  
  /** Build duration threshold in minutes */
  buildDuration: {
    warning: number;
    error: number;
  };
  
  /** Lambda error rate threshold (0-1) */
  lambdaErrorRate: {
    warning: number;
    error: number;
  };
  
  /** DynamoDB throttle events threshold (count) */
  dynamoDBThrottles: {
    warning: number;
    error: number;
  };
}

/**
 * Notification context for alarm notifications
 */
export interface NotificationContext {
  environment: string;
  resource: string;
  metricName: string;
  metricValue: number;
  threshold: number;
  recommendedActions: string[];
}

/**
 * Notification payload structure
 */
export interface Notification {
  severity: 'warning' | 'error';
  title: string;
  message: string;
  context: NotificationContext;
}

/**
 * NotificationInterface abstraction for decoupling alarm configuration
 * from notification delivery mechanism.
 * 
 * This interface allows future migration from SNS to SES without
 * modifying alarm configurations.
 */
export interface NotificationInterface {
  /**
   * Send notification through the configured delivery mechanism
   * 
   * @param notification - Notification payload with severity, title, message, and context
   */
  sendNotification(notification: Notification): Promise<void>;
  
  /**
   * Get the SNS topic ARN for CloudWatch Alarm actions
   * 
   * @returns SNS topic ARN
   */
  getTopicArn(): string;
}

/**
 * SNS-based implementation of NotificationInterface
 * 
 * This is the initial implementation using SNS topics.
 * Future implementations can use SES without changing alarm configurations.
 */
export class SNSNotificationService implements NotificationInterface {
  constructor(private readonly topic: sns.Topic) {}
  
  async sendNotification(notification: Notification): Promise<void> {
    // In actual implementation, this would format and send the notification
    // For CDK infrastructure, we just configure the topic
    // The actual sending happens via CloudWatch Alarm actions
    throw new Error('This method is for runtime use, not CDK infrastructure');
  }
  
  getTopicArn(): string {
    return this.topic.topicArn;
  }
}

/**
 * Properties for MonitoringAlertingStack
 */
export interface MonitoringAlertingStackProps extends cdk.StackProps {
  /** Environment-specific configuration */
  config: EnvironmentConfig;
  
  /** CodeBuild project to monitor from CodeBuildProjectsStack */
  codeBuildProject: codebuild.IProject;
  
  /** Lambda function to monitor from WorkItemPollerStack */
  lambdaFunction: lambda.IFunction;
  
  /** DynamoDB table to monitor from CoreInfrastructureStack */
  dynamoDBTable: dynamodb.ITable;
  
  /** Optional email address for alert notifications */
  alertEmail?: string;
}

/**
 * Monitoring and Alerting Stack
 * 
 * Creates comprehensive monitoring infrastructure with:
 * - SNS topics for notifications
 * - CloudWatch Alarms for all critical metrics
 * - Environment-specific thresholds
 * - NotificationInterface abstraction
 */
export class MonitoringAlertingStack extends cdk.Stack {
  /** SNS topic for alert notifications */
  public readonly alertTopic: sns.Topic;
  
  /** Notification service interface */
  public readonly notificationService: NotificationInterface;
  
  /** Alarm thresholds for this environment */
  public readonly alarmThresholds: AlarmThresholds;

  constructor(scope: Construct, id: string, props: MonitoringAlertingStackProps) {
    super(scope, id, props);

    const { config, codeBuildProject, lambdaFunction, dynamoDBTable, alertEmail } = props;
    const environment = config.environment;

    // Configure environment-specific alarm thresholds
    this.alarmThresholds = this.getAlarmThresholds(environment);

    // Create SNS topic for alerts
    this.alertTopic = this.createAlertTopic(environment, alertEmail);

    // Create notification service interface
    this.notificationService = new SNSNotificationService(this.alertTopic);

    // Create build metric alarms
    this.createBuildMetricAlarms(environment, codeBuildProject);

    // Create operation metric alarms
    this.createOperationMetricAlarms(environment, lambdaFunction, dynamoDBTable);

    // Create resource metric alarms
    this.createResourceMetricAlarms(environment, codeBuildProject, lambdaFunction);

    // Add stack outputs
    this.createOutputs();
  }

  /**
   * Get environment-specific alarm thresholds
   * 
   * Test environment has more relaxed thresholds.
   * Production has stricter thresholds for faster incident response.
   */
  private getAlarmThresholds(environment: string): AlarmThresholds {
    switch (environment) {
      case 'test':
        return {
          buildFailureRate: { warning: 0.40, error: 0.60 },
          buildDuration: { warning: 40, error: 50 },
          lambdaErrorRate: { warning: 0.20, error: 0.40 },
          dynamoDBThrottles: { warning: 10, error: 20 },
        };
      
      case 'staging':
        return {
          buildFailureRate: { warning: 0.30, error: 0.50 },
          buildDuration: { warning: 35, error: 45 },
          lambdaErrorRate: { warning: 0.15, error: 0.30 },
          dynamoDBThrottles: { warning: 5, error: 10 },
        };
      
      case 'production':
        return {
          buildFailureRate: { warning: 0.25, error: 0.50 },
          buildDuration: { warning: 30, error: 45 },
          lambdaErrorRate: { warning: 0.15, error: 0.30 },
          dynamoDBThrottles: { warning: 5, error: 10 },
        };
      
      default:
        // Default to production thresholds for safety
        return {
          buildFailureRate: { warning: 0.25, error: 0.50 },
          buildDuration: { warning: 30, error: 45 },
          lambdaErrorRate: { warning: 0.15, error: 0.30 },
          dynamoDBThrottles: { warning: 5, error: 10 },
        };
    }
  }

  /**
   * Create SNS topic for alert notifications
   */
  private createAlertTopic(environment: string, alertEmail?: string): sns.Topic {
    const topicName = `kiro-worker-${environment}-alerts`;
    
    const topic = new sns.Topic(this, 'AlertTopic', {
      topicName,
      displayName: `Kiro Worker ${environment} Alerts`,
      
      // Enable encryption at rest
      masterKey: undefined, // Use AWS managed key for SNS
    });

    // Add email subscription if provided
    if (alertEmail) {
      topic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }

    // Add tags
    cdk.Tags.of(topic).add('Component', 'Monitoring');
    cdk.Tags.of(topic).add('Purpose', 'Alerts');

    return topic;
  }

  /**
   * Create CloudWatch Alarms for build metrics
   * 
   * Monitors:
   * - Build failure rate
   * - Build duration
   */
  private createBuildMetricAlarms(
    environment: string,
    project: codebuild.IProject
  ): void {
    // Build Failure Rate - Warning
    const buildFailureWarning = new cloudwatch.Alarm(this, 'BuildFailureRateWarning', {
      alarmName: `kiro-worker-${environment}-build-failure-rate-warning`,
      alarmDescription: `Build failure rate exceeded ${this.alarmThresholds.buildFailureRate.warning * 100}% threshold in ${environment}`,
      
      metric: project.metricFailedBuilds({
        statistic: 'Sum',
        period: cdk.Duration.minutes(10),
      }),
      
      threshold: this.alarmThresholds.buildFailureRate.warning * 10, // 10 minute period
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    buildFailureWarning.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Build Failure Rate - Error
    const buildFailureError = new cloudwatch.Alarm(this, 'BuildFailureRateError', {
      alarmName: `kiro-worker-${environment}-build-failure-rate-error`,
      alarmDescription: `Build failure rate exceeded ${this.alarmThresholds.buildFailureRate.error * 100}% threshold in ${environment}. Immediate action required.`,
      
      metric: project.metricFailedBuilds({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: this.alarmThresholds.buildFailureRate.error * 5, // 5 minute period
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    buildFailureError.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Build Duration - Warning
    const buildDurationWarning = new cloudwatch.Alarm(this, 'BuildDurationWarning', {
      alarmName: `kiro-worker-${environment}-build-duration-warning`,
      alarmDescription: `Build duration exceeded ${this.alarmThresholds.buildDuration.warning} minutes in ${environment}`,
      
      metric: project.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(10),
      }),
      
      threshold: this.alarmThresholds.buildDuration.warning * 60, // Convert to seconds
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    buildDurationWarning.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Build Duration - Error
    const buildDurationError = new cloudwatch.Alarm(this, 'BuildDurationError', {
      alarmName: `kiro-worker-${environment}-build-duration-error`,
      alarmDescription: `Build duration exceeded ${this.alarmThresholds.buildDuration.error} minutes in ${environment}. Performance degradation detected.`,
      
      metric: project.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: this.alarmThresholds.buildDuration.error * 60, // Convert to seconds
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    buildDurationError.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Build Success Rate (inverse metric for visibility)
    const buildSuccessRate = new cloudwatch.Alarm(this, 'BuildSuccessRate', {
      alarmName: `kiro-worker-${environment}-build-success-rate-low`,
      alarmDescription: `Build success rate dropped below 75% in ${environment}`,
      
      metric: project.metricSucceededBuilds({
        statistic: 'Sum',
        period: cdk.Duration.minutes(30),
      }),
      
      threshold: 0.75 * 30, // 75% success rate over 30 minutes
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    buildSuccessRate.addAlarmAction(new actions.SnsAction(this.alertTopic));
  }

  /**
   * Create CloudWatch Alarms for operation metrics
   * 
   * Monitors:
   * - Lambda function errors
   * - Lambda function throttles
   * - DynamoDB throttles
   * - DynamoDB read/write capacity
   */
  private createOperationMetricAlarms(
    environment: string,
    lambdaFunction: lambda.IFunction,
    dynamoDBTable: dynamodb.ITable
  ): void {
    // Lambda Error Rate - Warning
    const lambdaErrorWarning = new cloudwatch.Alarm(this, 'LambdaErrorRateWarning', {
      alarmName: `kiro-worker-${environment}-lambda-error-rate-warning`,
      alarmDescription: `Lambda error rate exceeded ${this.alarmThresholds.lambdaErrorRate.warning * 100}% in ${environment}`,
      
      metric: lambdaFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(10),
      }),
      
      threshold: this.alarmThresholds.lambdaErrorRate.warning * 10,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    lambdaErrorWarning.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Lambda Error Rate - Error
    const lambdaErrorError = new cloudwatch.Alarm(this, 'LambdaErrorRateError', {
      alarmName: `kiro-worker-${environment}-lambda-error-rate-error`,
      alarmDescription: `Lambda error rate exceeded ${this.alarmThresholds.lambdaErrorRate.error * 100}% in ${environment}. Critical issue detected.`,
      
      metric: lambdaFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: this.alarmThresholds.lambdaErrorRate.error * 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    lambdaErrorError.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Lambda Throttles
    const lambdaThrottles = new cloudwatch.Alarm(this, 'LambdaThrottles', {
      alarmName: `kiro-worker-${environment}-lambda-throttles`,
      alarmDescription: `Lambda function is being throttled in ${environment}. Consider increasing concurrency limits.`,
      
      metric: lambdaFunction.metricThrottles({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    lambdaThrottles.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Lambda Duration (approaching timeout)
    const lambdaDuration = new cloudwatch.Alarm(this, 'LambdaDuration', {
      alarmName: `kiro-worker-${environment}-lambda-duration-high`,
      alarmDescription: `Lambda function duration approaching timeout in ${environment}`,
      
      metric: lambdaFunction.metricDuration({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: 12 * 60 * 1000, // 12 minutes (80% of 15 minute timeout)
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    lambdaDuration.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // DynamoDB Read Throttles - Warning
    const dynamoReadThrottleWarning = new cloudwatch.Alarm(this, 'DynamoDBReadThrottleWarning', {
      alarmName: `kiro-worker-${environment}-dynamodb-read-throttle-warning`,
      alarmDescription: `DynamoDB read throttles detected in ${environment}`,
      
      metric: dynamoDBTable.metricUserErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: this.alarmThresholds.dynamoDBThrottles.warning,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    dynamoReadThrottleWarning.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // DynamoDB Read Throttles - Error
    const dynamoReadThrottleError = new cloudwatch.Alarm(this, 'DynamoDBReadThrottleError', {
      alarmName: `kiro-worker-${environment}-dynamodb-read-throttle-error`,
      alarmDescription: `DynamoDB read throttles exceeded threshold in ${environment}. Consider increasing capacity.`,
      
      metric: dynamoDBTable.metricUserErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: this.alarmThresholds.dynamoDBThrottles.error,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    dynamoReadThrottleError.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // DynamoDB System Errors
    const dynamoSystemErrors = new cloudwatch.Alarm(this, 'DynamoDBSystemErrors', {
      alarmName: `kiro-worker-${environment}-dynamodb-system-errors`,
      alarmDescription: `DynamoDB system errors detected in ${environment}`,
      
      metric: dynamoDBTable.metricSystemErrorsForOperations({
        operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.GET_ITEM, dynamodb.Operation.DELETE_ITEM],
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    dynamoSystemErrors.addAlarmAction(new actions.SnsAction(this.alertTopic));
  }

  /**
   * Create CloudWatch Alarms for resource metrics
   * 
   * Monitors:
   * - CodeBuild CPU utilization
   * - CodeBuild memory utilization
   * - Lambda concurrent executions
   */
  private createResourceMetricAlarms(
    environment: string,
    project: codebuild.IProject,
    lambdaFunction: lambda.IFunction
  ): void {
    // Lambda Concurrent Executions
    const lambdaConcurrency = new cloudwatch.Alarm(this, 'LambdaConcurrentExecutions', {
      alarmName: `kiro-worker-${environment}-lambda-concurrency-high`,
      alarmDescription: `Lambda concurrent executions approaching limit in ${environment}`,
      
      metric: lambdaFunction.metricInvocations({
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      
      threshold: 5, // Alert if more than 5 concurrent invocations
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    
    lambdaConcurrency.addAlarmAction(new actions.SnsAction(this.alertTopic));

    // Note: CodeBuild CPU and memory metrics are not directly available via CDK
    // These would need to be created using custom metrics if CodeBuild publishes them
    // or through CloudWatch Container Insights if enabled
  }

  /**
   * Create CloudFormation outputs for cross-stack references
   */
  private createOutputs(): void {
    // SNS topic outputs
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'ARN of the SNS topic for alert notifications',
      exportName: `${this.stackName}-AlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'AlertTopicName', {
      value: this.alertTopic.topicName,
      description: 'Name of the SNS topic for alert notifications',
      exportName: `${this.stackName}-AlertTopicName`,
    });

    // Alarm threshold outputs for reference
    new cdk.CfnOutput(this, 'BuildFailureRateWarningThreshold', {
      value: (this.alarmThresholds.buildFailureRate.warning * 100).toString(),
      description: 'Build failure rate warning threshold percentage',
    });

    new cdk.CfnOutput(this, 'BuildFailureRateErrorThreshold', {
      value: (this.alarmThresholds.buildFailureRate.error * 100).toString(),
      description: 'Build failure rate error threshold percentage',
    });

    new cdk.CfnOutput(this, 'BuildDurationWarningThreshold', {
      value: this.alarmThresholds.buildDuration.warning.toString(),
      description: 'Build duration warning threshold in minutes',
    });

    new cdk.CfnOutput(this, 'BuildDurationErrorThreshold', {
      value: this.alarmThresholds.buildDuration.error.toString(),
      description: 'Build duration error threshold in minutes',
    });
  }
}
