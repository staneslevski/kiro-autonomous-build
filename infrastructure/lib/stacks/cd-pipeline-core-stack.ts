/**
 * CD Pipeline Core Infrastructure Stack
 * 
 * This stack creates the core infrastructure resources for the CD pipeline:
 * - S3 artifacts bucket for pipeline artifacts
 * - DynamoDB table for deployment state tracking
 * - KMS encryption key for pipeline resources
 * - CloudWatch log groups for pipeline and rollback logs
 * 
 * These resources are shared across all pipeline stages and environments.
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Properties for CD Pipeline Core Stack
 */
export interface CDPipelineCoreStackProps extends cdk.StackProps {
  /** Environment name (test, staging, production) */
  environment: 'test' | 'staging' | 'production';
}

/**
 * CD Pipeline Core Infrastructure Stack
 * 
 * Creates foundational resources for the CD pipeline including artifact storage,
 * deployment state tracking, encryption, and logging infrastructure.
 */
export class CDPipelineCoreStack extends cdk.Stack {
  /** S3 bucket for pipeline artifacts */
  public readonly artifactsBucket: s3.Bucket;
  
  /** DynamoDB table for deployment state tracking */
  public readonly deploymentsTable: dynamodb.Table;
  
  /** KMS key for encrypting pipeline resources */
  public readonly kmsKey: kms.Key;
  
  /** CloudWatch log group for pipeline logs */
  public readonly pipelineLogGroup: logs.LogGroup;
  
  /** CloudWatch log group for rollback Lambda logs */
  public readonly rollbackLogGroup: logs.LogGroup;
  
  constructor(scope: Construct, id: string, props: CDPipelineCoreStackProps) {
    super(scope, id, props);
    
    const { environment } = props;
    
    // Create KMS encryption key for pipeline resources
    this.kmsKey = this.createKmsKey(environment);
    
    // Create S3 artifacts bucket
    this.artifactsBucket = this.createArtifactsBucket(environment);
    
    // Create DynamoDB deployments table
    this.deploymentsTable = this.createDeploymentsTable(environment);
    
    // Create CloudWatch log groups
    this.pipelineLogGroup = this.createPipelineLogGroup(environment);
    this.rollbackLogGroup = this.createRollbackLogGroup(environment);
    
    // Export stack outputs
    this.exportOutputs(environment);
    
    // Add tags
    this.addTags(environment);
  }
  
  /**
   * Create KMS encryption key with rotation enabled
   */
  private createKmsKey(environment: string): kms.Key {
    const key = new kms.Key(this, 'PipelineKey', {
      description: `KMS key for Kiro CD Pipeline ${environment} resources`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      alias: `kiro-pipeline-${environment}`,
    });
    
    return key;
  }
  
  /**
   * Create S3 artifacts bucket with encryption, versioning, and lifecycle policies
   */
  private createArtifactsBucket(environment: string): s3.Bucket {
    const bucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: `kiro-pipeline-${environment}-artifacts`,
      
      // Encryption with KMS
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      
      // Enable versioning
      versioned: true,
      
      // Block all public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // Lifecycle policies
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      
      // Retention policy
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      
      // Enable server access logging (optional, can be configured later)
      // serverAccessLogsPrefix: 'access-logs/',
    });
    
    return bucket;
  }
  
  /**
   * Create DynamoDB table for deployment state tracking
   */
  private createDeploymentsTable(environment: string): dynamodb.Table {
    const table = new dynamodb.Table(this, 'DeploymentsTable', {
      tableName: `kiro-pipeline-${environment}-deployments`,
      
      // Partition key
      partitionKey: {
        name: 'deploymentId',
        type: dynamodb.AttributeType.STRING,
      },
      
      // Billing mode
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      
      // Encryption
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      
      // Point-in-time recovery
      pointInTimeRecovery: true,
      
      // TTL attribute for automatic cleanup (90 days)
      timeToLiveAttribute: 'expiresAt',
      
      // Retention policy
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      
      // Enable streams for change tracking
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });
    
    // Add Global Secondary Index for querying by environment and status
    table.addGlobalSecondaryIndex({
      indexName: 'EnvironmentStatusIndex',
      partitionKey: {
        name: 'environment',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    
    return table;
  }
  
  /**
   * Create CloudWatch log group for pipeline logs
   */
  private createPipelineLogGroup(environment: string): logs.LogGroup {
    const logGroup = new logs.LogGroup(this, 'PipelineLogGroup', {
      logGroupName: `/aws/codepipeline/kiro-pipeline-${environment}`,
      
      // 90-day retention
      retention: logs.RetentionDays.THREE_MONTHS,
      
      // Encryption with KMS
      encryptionKey: this.kmsKey,
      
      // Retention policy
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    return logGroup;
  }
  
  /**
   * Create CloudWatch log group for rollback Lambda logs
   */
  private createRollbackLogGroup(environment: string): logs.LogGroup {
    const logGroup = new logs.LogGroup(this, 'RollbackLogGroup', {
      logGroupName: `/aws/lambda/kiro-pipeline-${environment}-rollback`,
      
      // 90-day retention
      retention: logs.RetentionDays.THREE_MONTHS,
      
      // Encryption with KMS
      encryptionKey: this.kmsKey,
      
      // Retention policy
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    return logGroup;
  }
  
  /**
   * Export stack outputs for cross-stack references
   */
  private exportOutputs(environment: string): void {
    // Artifacts bucket outputs
    new cdk.CfnOutput(this, 'ArtifactsBucketArn', {
      value: this.artifactsBucket.bucketArn,
      description: 'ARN of the pipeline artifacts S3 bucket',
      exportName: `kiro-pipeline-${environment}-artifacts-bucket-arn`,
    });
    
    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: this.artifactsBucket.bucketName,
      description: 'Name of the pipeline artifacts S3 bucket',
      exportName: `kiro-pipeline-${environment}-artifacts-bucket-name`,
    });
    
    // Deployments table outputs
    new cdk.CfnOutput(this, 'DeploymentsTableName', {
      value: this.deploymentsTable.tableName,
      description: 'Name of the deployments DynamoDB table',
      exportName: `kiro-pipeline-${environment}-deployments-table-name`,
    });
    
    new cdk.CfnOutput(this, 'DeploymentsTableArn', {
      value: this.deploymentsTable.tableArn,
      description: 'ARN of the deployments DynamoDB table',
      exportName: `kiro-pipeline-${environment}-deployments-table-arn`,
    });
    
    // KMS key output
    new cdk.CfnOutput(this, 'KmsKeyArn', {
      value: this.kmsKey.keyArn,
      description: 'ARN of the pipeline KMS encryption key',
      exportName: `kiro-pipeline-${environment}-kms-key-arn`,
    });
    
    // Log group outputs
    new cdk.CfnOutput(this, 'PipelineLogGroupName', {
      value: this.pipelineLogGroup.logGroupName,
      description: 'Name of the pipeline CloudWatch log group',
      exportName: `kiro-pipeline-${environment}-pipeline-log-group-name`,
    });
    
    new cdk.CfnOutput(this, 'RollbackLogGroupName', {
      value: this.rollbackLogGroup.logGroupName,
      description: 'Name of the rollback Lambda CloudWatch log group',
      exportName: `kiro-pipeline-${environment}-rollback-log-group-name`,
    });
  }
  
  /**
   * Add tags to all resources in the stack
   */
  private addTags(environment: string): void {
    cdk.Tags.of(this).add('Project', 'KiroPipeline');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Stack', 'CDPipelineCore');
  }
}
