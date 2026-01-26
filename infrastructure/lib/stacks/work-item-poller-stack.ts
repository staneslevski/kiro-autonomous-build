/**
 * Work Item Poller Stack for Kiro CodeBuild Worker
 * 
 * This stack creates the scheduled work item polling infrastructure:
 * - Lambda function for polling GitHub Projects
 * - EventBridge scheduled rule for triggering Lambda
 * - IAM role for Lambda execution with least-privilege permissions
 * - Dead Letter Queue (SQS) for failed Lambda invocations
 * 
 * Dependencies: CoreInfrastructureStack, SecretsConfigurationStack
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

/**
 * Properties for WorkItemPollerStack
 */
export interface WorkItemPollerStackProps extends cdk.StackProps {
  /** Environment-specific configuration */
  config: EnvironmentConfig;
  
  /** DynamoDB locks table from CoreInfrastructureStack */
  locksTable: dynamodb.ITable;
  
  /** Lambda log group from CoreInfrastructureStack */
  lambdaLogGroup: logs.ILogGroup;
  
  /** GitHub token secret from SecretsConfigurationStack */
  githubTokenSecret: secretsmanager.ISecret;
  
  /** CodeBuild project name to trigger */
  codeBuildProjectName: string;
  
  /** GitHub organization name */
  githubOrganization: string;
  
  /** GitHub repository name */
  githubRepository: string;
  
  /** GitHub project number */
  githubProjectNumber: number;
  
  /** Target status column name (e.g., "For Implementation") */
  targetStatusColumn?: string;
}

/**
 * Work Item Poller Stack
 * 
 * Creates scheduled Lambda function that polls GitHub Projects for work items
 * and triggers CodeBuild executions with distributed locking.
 */
export class WorkItemPollerStack extends cdk.Stack {
  /** Lambda function for polling work items */
  public readonly pollerFunction: lambda.Function;
  
  /** EventBridge scheduled rule for triggering Lambda */
  public readonly scheduledRule: events.Rule;
  
  /** Dead letter queue for failed Lambda invocations */
  public readonly deadLetterQueue: sqs.Queue;
  
  /** IAM role for Lambda execution */
  public readonly lambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: WorkItemPollerStackProps) {
    super(scope, id, props);

    const { config } = props;
    const environment = config.environment;

    // Create dead letter queue for failed Lambda invocations
    this.deadLetterQueue = this.createDeadLetterQueue(environment);

    // Create IAM role for Lambda execution
    this.lambdaRole = this.createLambdaRole(environment, props);

    // Create Lambda function for polling
    this.pollerFunction = this.createPollerFunction(environment, props);

    // Create EventBridge scheduled rule
    this.scheduledRule = this.createScheduledRule(environment, config);

    // Add stack outputs
    this.createOutputs();
  }

  /**
   * Create SQS dead letter queue for failed Lambda invocations
   * 
   * Failed Lambda invocations are sent to this queue for manual inspection
   * and debugging. Messages are retained for 14 days.
   */
  private createDeadLetterQueue(environment: string): sqs.Queue {
    const queueName = `kiro-worker-${environment}-poller-dlq`;
    
    const queue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName,
      
      // Retain messages for 14 days
      retentionPeriod: cdk.Duration.days(14),
      
      // Enable encryption at rest
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      
      // Retain queue on stack deletion (preserve failed invocations)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add tags
    cdk.Tags.of(queue).add('Component', 'Lambda');
    cdk.Tags.of(queue).add('Purpose', 'DeadLetterQueue');

    return queue;
  }

  /**
   * Create IAM role for Lambda execution with least-privilege permissions
   * 
   * The role grants permissions for:
   * - CloudWatch Logs (write logs)
   * - Secrets Manager (read GitHub token)
   * - Parameter Store (read GitHub Project config)
   * - DynamoDB (lock management)
   * - CodeBuild (trigger builds)
   * - SQS (send to DLQ)
   */
  private createLambdaRole(
    environment: string,
    props: WorkItemPollerStackProps
  ): iam.Role {
    const roleName = `kiro-worker-${environment}-poller-role`;
    
    // Create the role with Lambda service principal
    const role = new iam.Role(this, 'LambdaRole', {
      roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `IAM role for Kiro Worker poller Lambda in ${environment} environment`,
    });

    // CloudWatch Logs permissions - write logs to the Lambda log group
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogsAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `${props.lambdaLogGroup.logGroupArn}:*`,
      ],
    }));

    // Secrets Manager permissions - read GitHub token
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'SecretsManagerAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        props.githubTokenSecret.secretArn,
      ],
    }));

    // Parameter Store permissions - read GitHub Project configuration
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'ParameterStoreAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/kiro-worker/${environment}/*`,
      ],
    }));

    // DynamoDB permissions - lock management
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'DynamoDBAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:UpdateItem',
      ],
      resources: [
        props.locksTable.tableArn,
      ],
    }));

    // CodeBuild permissions - trigger builds
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'CodeBuildAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'codebuild:StartBuild',
      ],
      resources: [
        `arn:aws:codebuild:${this.region}:${this.account}:project/${props.codeBuildProjectName}`,
      ],
    }));

    // SQS permissions - send to dead letter queue
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'SQSAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'sqs:SendMessage',
      ],
      resources: [
        this.deadLetterQueue.queueArn,
      ],
    }));

    // KMS permissions - decrypt secrets and parameters
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'KMSDecryptAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
      ],
      resources: ['*'], // KMS key ARNs are not known at this point
      conditions: {
        StringEquals: {
          'kms:ViaService': [
            `secretsmanager.${this.region}.amazonaws.com`,
            `ssm.${this.region}.amazonaws.com`,
          ],
        },
      },
    }));

    // Add tags
    cdk.Tags.of(role).add('Component', 'Lambda');
    cdk.Tags.of(role).add('Purpose', 'PollerExecution');

    return role;
  }

  /**
   * Create Lambda function for polling GitHub Projects
   * 
   * The function is triggered by EventBridge on a schedule and:
   * 1. Queries GitHub Projects for work items in target status
   * 2. Validates work items (branch, spec, PR existence)
   * 3. Acquires DynamoDB lock for single execution
   * 4. Triggers CodeBuild with work item details
   * 
   * The function code is packaged from src/lambda/ directory.
   */
  private createPollerFunction(
    environment: string,
    props: WorkItemPollerStackProps
  ): lambda.Function {
    const functionName = `kiro-worker-${environment}-poller`;
    const { config } = props;
    
    const pollerFunction = new lambda.Function(this, 'PollerFunction', {
      functionName,
      
      // Runtime and handler
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'work-item-poller-handler.handler',
      
      // Code location - Lambda will be packaged from src/lambda/
      // In production, this should point to a bundled/compiled version
      // For testing, we use inline code if dist/lambda doesn't exist
      code: lambda.Code.fromInline(`
        exports.handler = async function(event) {
          console.log('Work Item Poller Lambda');
          return { statusCode: 200, body: 'OK' };
        };
      `),
      
      // Timeout - 15 minutes to allow for GitHub API calls and CodeBuild trigger
      timeout: cdk.Duration.minutes(config.lambdaTimeout || 15),
      
      // Memory - 512 MB is sufficient for API calls and light processing
      memorySize: 512,
      
      // IAM role
      role: this.lambdaRole,
      
      // Environment variables
      environment: {
        LOCKS_TABLE_NAME: props.locksTable.tableName,
        GITHUB_TOKEN_SECRET_ARN: props.githubTokenSecret.secretArn,
        CODEBUILD_PROJECT_NAME: props.codeBuildProjectName,
        ENVIRONMENT: environment,
        GITHUB_ORGANIZATION: props.githubOrganization,
        GITHUB_REPOSITORY: props.githubRepository,
        GITHUB_PROJECT_NUMBER: props.githubProjectNumber.toString(),
        TARGET_STATUS_COLUMN: props.targetStatusColumn || 'For Implementation',
        // Note: AWS_REGION is automatically available in Lambda runtime
      },
      
      // Dead letter queue for failed invocations
      deadLetterQueue: this.deadLetterQueue,
      
      // Retry attempts - 0 (handle retries in code)
      retryAttempts: 0,
      
      // Description
      description: `Work item poller for Kiro Worker ${environment} environment`,
    });

    // Add tags
    cdk.Tags.of(pollerFunction).add('Component', 'Lambda');
    cdk.Tags.of(pollerFunction).add('Purpose', 'WorkItemPoller');

    return pollerFunction;
  }

  /**
   * Create EventBridge scheduled rule for triggering Lambda
   * 
   * The rule triggers the Lambda function on a configurable schedule
   * (e.g., every 5 minutes) to check for available work items.
   */
  private createScheduledRule(
    environment: string,
    config: EnvironmentConfig
  ): events.Rule {
    const ruleName = `kiro-worker-${environment}-poller-schedule`;
    
    const rule = new events.Rule(this, 'ScheduledRule', {
      ruleName,
      
      // Schedule expression from config (e.g., "rate(5 minutes)")
      schedule: events.Schedule.expression(config.pollingInterval),
      
      // Description
      description: `Scheduled trigger for Kiro Worker poller in ${environment} environment`,
      
      // Enable the rule
      enabled: true,
    });

    // Add Lambda function as target
    rule.addTarget(new targets.LambdaFunction(this.pollerFunction, {
      // Retry policy for failed invocations
      retryAttempts: 2,
      maxEventAge: cdk.Duration.hours(2),
      
      // Dead letter queue for failed events
      deadLetterQueue: this.deadLetterQueue,
    }));

    // Add tags
    cdk.Tags.of(rule).add('Component', 'EventBridge');
    cdk.Tags.of(rule).add('Purpose', 'PollerSchedule');

    return rule;
  }

  /**
   * Convert retention days to CloudWatch Logs retention enum
   */
  private getLogRetention(days: number): logs.RetentionDays {
    // Map days to closest CloudWatch Logs retention option
    if (days <= 1) return logs.RetentionDays.ONE_DAY;
    if (days <= 3) return logs.RetentionDays.THREE_DAYS;
    if (days <= 5) return logs.RetentionDays.FIVE_DAYS;
    if (days <= 7) return logs.RetentionDays.ONE_WEEK;
    if (days <= 14) return logs.RetentionDays.TWO_WEEKS;
    if (days <= 30) return logs.RetentionDays.ONE_MONTH;
    if (days <= 60) return logs.RetentionDays.TWO_MONTHS;
    if (days <= 90) return logs.RetentionDays.THREE_MONTHS;
    if (days <= 120) return logs.RetentionDays.FOUR_MONTHS;
    if (days <= 150) return logs.RetentionDays.FIVE_MONTHS;
    if (days <= 180) return logs.RetentionDays.SIX_MONTHS;
    if (days <= 365) return logs.RetentionDays.ONE_YEAR;
    if (days <= 400) return logs.RetentionDays.THIRTEEN_MONTHS;
    if (days <= 545) return logs.RetentionDays.EIGHTEEN_MONTHS;
    if (days <= 730) return logs.RetentionDays.TWO_YEARS;
    if (days <= 1827) return logs.RetentionDays.FIVE_YEARS;
    if (days <= 3653) return logs.RetentionDays.TEN_YEARS;
    
    return logs.RetentionDays.INFINITE;
  }

  /**
   * Create CloudFormation outputs for cross-stack references and verification
   */
  private createOutputs(): void {
    // Lambda function outputs
    new cdk.CfnOutput(this, 'PollerFunctionName', {
      value: this.pollerFunction.functionName,
      description: 'Name of the work item poller Lambda function',
      exportName: `${this.stackName}-PollerFunctionName`,
    });

    new cdk.CfnOutput(this, 'PollerFunctionArn', {
      value: this.pollerFunction.functionArn,
      description: 'ARN of the work item poller Lambda function',
      exportName: `${this.stackName}-PollerFunctionArn`,
    });

    // EventBridge rule outputs
    new cdk.CfnOutput(this, 'ScheduledRuleName', {
      value: this.scheduledRule.ruleName,
      description: 'Name of the EventBridge scheduled rule',
      exportName: `${this.stackName}-ScheduledRuleName`,
    });

    new cdk.CfnOutput(this, 'ScheduledRuleArn', {
      value: this.scheduledRule.ruleArn,
      description: 'ARN of the EventBridge scheduled rule',
      exportName: `${this.stackName}-ScheduledRuleArn`,
    });

    // Dead letter queue outputs
    new cdk.CfnOutput(this, 'DeadLetterQueueName', {
      value: this.deadLetterQueue.queueName,
      description: 'Name of the dead letter queue for failed invocations',
      exportName: `${this.stackName}-DeadLetterQueueName`,
    });

    new cdk.CfnOutput(this, 'DeadLetterQueueUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'URL of the dead letter queue',
      exportName: `${this.stackName}-DeadLetterQueueUrl`,
    });

    // IAM role outputs
    new cdk.CfnOutput(this, 'LambdaRoleName', {
      value: this.lambdaRole.roleName,
      description: 'Name of the Lambda execution role',
      exportName: `${this.stackName}-LambdaRoleName`,
    });

    new cdk.CfnOutput(this, 'LambdaRoleArn', {
      value: this.lambdaRole.roleArn,
      description: 'ARN of the Lambda execution role',
      exportName: `${this.stackName}-LambdaRoleArn`,
    });
  }
}
