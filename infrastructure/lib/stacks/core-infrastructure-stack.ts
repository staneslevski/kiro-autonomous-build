/**
 * Core Infrastructure Stack for Kiro CodeBuild Worker
 * 
 * This stack creates the foundational infrastructure resources:
 * - S3 bucket for build artifacts with encryption, versioning, and lifecycle rules
 * - CloudWatch Log Groups for CodeBuild and Lambda logging
 * - DynamoDB table for work item locking with TTL
 * 
 * Dependencies: None (this is the foundation stack)
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

/**
 * Properties for CoreInfrastructureStack
 */
export interface CoreInfrastructureStackProps extends cdk.StackProps {
  /** Environment-specific configuration */
  config: EnvironmentConfig;
}

/**
 * Core Infrastructure Stack
 * 
 * Creates foundational resources for the Kiro Worker system:
 * - S3 artifacts bucket
 * - CloudWatch log groups
 * - DynamoDB locks table
 */
export class CoreInfrastructureStack extends cdk.Stack {
  /** S3 bucket for storing build artifacts */
  public readonly artifactsBucket: s3.Bucket;
  
  /** CloudWatch log group for CodeBuild projects */
  public readonly codeBuildLogGroup: logs.LogGroup;
  
  /** CloudWatch log group for Lambda functions */
  public readonly lambdaLogGroup: logs.LogGroup;
  
  /** DynamoDB table for work item locking */
  public readonly locksTable: dynamodb.Table;
  
  /** IAM role for CodeBuild projects */
  public readonly codeBuildRole: iam.Role;

  constructor(scope: Construct, id: string, props: CoreInfrastructureStackProps) {
    super(scope, id, props);

    const { config } = props;
    const environment = config.environment;

    // Create S3 bucket for artifacts
    this.artifactsBucket = this.createArtifactsBucket(environment, config);

    // Create CloudWatch log groups
    this.codeBuildLogGroup = this.createCodeBuildLogGroup(environment, config);
    this.lambdaLogGroup = this.createLambdaLogGroup(environment, config);

    // Create DynamoDB table for work item locking
    this.locksTable = this.createLocksTable(environment, config);

    // Create IAM role for CodeBuild projects
    this.codeBuildRole = this.createCodeBuildRole(environment);

    // Add stack outputs
    this.createOutputs();
  }

  /**
   * Create S3 bucket for build artifacts with encryption, versioning, and lifecycle rules
   */
  private createArtifactsBucket(environment: string, config: EnvironmentConfig): s3.Bucket {
    const bucketName = `kiro-worker-${environment}-artifacts`;
    
    const bucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName,
      
      // Enable encryption at rest
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Enable versioning for artifact history
      versioned: true,
      
      // Block all public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // Retain bucket on stack deletion (protect artifacts)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      
      // Enable server access logging (optional, can be configured later)
      // serverAccessLogsPrefix: 'access-logs/',
      
      // Lifecycle rules for cost optimization
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: cdk.Duration.days(config.artifactRetentionDays || 90),
        },
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          id: 'TransitionToInfrequentAccess',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      
      // Enable intelligent tiering for cost optimization
      intelligentTieringConfigurations: [
        {
          name: 'ArchiveOldArtifacts',
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
        },
      ],
    });

    // Add tags
    cdk.Tags.of(bucket).add('Component', 'Artifacts');
    cdk.Tags.of(bucket).add('Purpose', 'BuildArtifacts');

    return bucket;
  }

  /**
   * Create CloudWatch log group for CodeBuild projects
   */
  private createCodeBuildLogGroup(environment: string, config: EnvironmentConfig): logs.LogGroup {
    const logGroupName = `/aws/codebuild/kiro-worker-${environment}`;
    
    const logGroup = new logs.LogGroup(this, 'CodeBuildLogGroup', {
      logGroupName,
      
      // Set retention period based on environment
      retention: this.getLogRetention(config.logRetentionDays || 30),
      
      // Retain logs on stack deletion
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add tags
    cdk.Tags.of(logGroup).add('Component', 'CodeBuild');
    cdk.Tags.of(logGroup).add('Purpose', 'BuildLogs');

    return logGroup;
  }

  /**
   * Create CloudWatch log group for Lambda functions
   */
  private createLambdaLogGroup(environment: string, config: EnvironmentConfig): logs.LogGroup {
    const logGroupName = `/aws/lambda/kiro-worker-${environment}-poller`;
    
    const logGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName,
      
      // Set retention period based on environment
      retention: this.getLogRetention(config.logRetentionDays || 30),
      
      // Retain logs on stack deletion
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add tags
    cdk.Tags.of(logGroup).add('Component', 'Lambda');
    cdk.Tags.of(logGroup).add('Purpose', 'PollerLogs');

    return logGroup;
  }

  /**
   * Create DynamoDB table for work item locking with TTL
   */
  private createLocksTable(environment: string, config: EnvironmentConfig): dynamodb.Table {
    const tableName = `kiro-worker-${environment}-locks`;
    
    const table = new dynamodb.Table(this, 'LocksTable', {
      tableName,
      
      // Partition key for lock management
      partitionKey: {
        name: 'lockKey',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Use on-demand billing for variable workloads
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Enable encryption at rest with AWS managed keys
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // Enable point-in-time recovery for production
      pointInTimeRecovery: environment === 'production',
      
      // Retain table on stack deletion (protect lock state)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      
      // Enable TTL on expiresAt attribute for automatic lock cleanup
      timeToLiveAttribute: 'expiresAt',
    });

    // Add tags
    cdk.Tags.of(table).add('Component', 'Locking');
    cdk.Tags.of(table).add('Purpose', 'WorkItemLocks');

    return table;
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
   * Create IAM role for CodeBuild projects with least-privilege permissions
   */
  private createCodeBuildRole(environment: string): iam.Role {
    const roleName = `kiro-worker-${environment}-codebuild-role`;
    
    // Create the role with CodeBuild service principal
    const role = new iam.Role(this, 'CodeBuildRole', {
      roleName,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: `IAM role for Kiro Worker CodeBuild projects in ${environment} environment`,
    });

    // CloudWatch Logs permissions - write logs to the CodeBuild log group
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogsAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `${this.codeBuildLogGroup.logGroupArn}:*`,
      ],
    }));

    // S3 permissions - read/write artifacts to the artifacts bucket
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'S3ArtifactsAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        this.artifactsBucket.bucketArn,
        `${this.artifactsBucket.bucketArn}/*`,
      ],
    }));

    // Secrets Manager permissions - read secrets for Git credentials and API tokens
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'SecretsManagerAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:kiro-worker-${environment}-*`,
      ],
    }));

    // Parameter Store permissions - read configuration parameters
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'ParameterStoreAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/kiro-worker/${environment}/*`,
      ],
    }));

    // KMS permissions - decrypt secrets and parameters
    // This allows decryption only when accessed via Secrets Manager or SSM
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
    cdk.Tags.of(role).add('Component', 'CodeBuild');
    cdk.Tags.of(role).add('Purpose', 'BuildExecution');

    return role;
  }

  /**
   * Create CloudFormation outputs for cross-stack references
   */
  private createOutputs(): void {
    // S3 bucket outputs
    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: this.artifactsBucket.bucketName,
      description: 'Name of the S3 bucket for build artifacts',
      exportName: `${this.stackName}-ArtifactsBucketName`,
    });

    new cdk.CfnOutput(this, 'ArtifactsBucketArn', {
      value: this.artifactsBucket.bucketArn,
      description: 'ARN of the S3 bucket for build artifacts',
      exportName: `${this.stackName}-ArtifactsBucketArn`,
    });

    // CloudWatch log group outputs
    new cdk.CfnOutput(this, 'CodeBuildLogGroupName', {
      value: this.codeBuildLogGroup.logGroupName,
      description: 'Name of the CloudWatch log group for CodeBuild',
      exportName: `${this.stackName}-CodeBuildLogGroupName`,
    });

    new cdk.CfnOutput(this, 'LambdaLogGroupName', {
      value: this.lambdaLogGroup.logGroupName,
      description: 'Name of the CloudWatch log group for Lambda',
      exportName: `${this.stackName}-LambdaLogGroupName`,
    });

    // DynamoDB table outputs
    new cdk.CfnOutput(this, 'LocksTableName', {
      value: this.locksTable.tableName,
      description: 'Name of the DynamoDB table for work item locking',
      exportName: `${this.stackName}-LocksTableName`,
    });

    new cdk.CfnOutput(this, 'LocksTableArn', {
      value: this.locksTable.tableArn,
      description: 'ARN of the DynamoDB table for work item locking',
      exportName: `${this.stackName}-LocksTableArn`,
    });

    // IAM role outputs
    new cdk.CfnOutput(this, 'CodeBuildRoleName', {
      value: this.codeBuildRole.roleName,
      description: 'Name of the IAM role for CodeBuild projects',
      exportName: `${this.stackName}-CodeBuildRoleName`,
    });

    new cdk.CfnOutput(this, 'CodeBuildRoleArn', {
      value: this.codeBuildRole.roleArn,
      description: 'ARN of the IAM role for CodeBuild projects',
      exportName: `${this.stackName}-CodeBuildRoleArn`,
    });
  }
}
