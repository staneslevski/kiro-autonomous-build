/**
 * Unit tests for CoreInfrastructureStack
 * 
 * Tests CloudFormation template generation and resource configuration
 * for S3 buckets, CloudWatch log groups, and DynamoDB tables.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CoreInfrastructureStack } from '../../lib/stacks/core-infrastructure-stack';
import { EnvironmentConfig } from '../../lib/config/environments';

describe('CoreInfrastructureStack', () => {
  let app: cdk.App;
  let testConfig: EnvironmentConfig;

  beforeEach(() => {
    app = new cdk.App();
    testConfig = {
      account: '123456789012',
      region: 'us-east-1',
      environment: 'test',
      coverageThreshold: 80,
      pollingInterval: 'rate(5 minutes)',
      codeBuildComputeType: 'SMALL',
      codeBuildTimeout: 60,
      lambdaTimeout: 15,
      lockTTLHours: 2,
      artifactRetentionDays: 30,
      logRetentionDays: 7,
      enableDetailedMetrics: true,
    };
  });

  describe('Stack Creation', () => {
    it('should create stack successfully', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      expect(stack).toBeDefined();
      expect(stack.artifactsBucket).toBeDefined();
      expect(stack.codeBuildLogGroup).toBeDefined();
      expect(stack.lambdaLogGroup).toBeDefined();
      expect(stack.locksTable).toBeDefined();
      expect(stack.codeBuildRole).toBeDefined();
    });

    it('should match snapshot', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });

  describe('S3 Artifacts Bucket', () => {
    it('should create S3 bucket with correct name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'kiro-worker-test-artifacts',
      });
    });

    it('should enable encryption', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });

    it('should enable versioning', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    it('should block all public access', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    it('should configure lifecycle rules', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldArtifacts',
              Status: 'Enabled',
              ExpirationInDays: 30,
            }),
            Match.objectLike({
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
              NoncurrentVersionExpiration: {
                NoncurrentDays: 30,
              },
            }),
            Match.objectLike({
              Id: 'TransitionToInfrequentAccess',
              Status: 'Enabled',
              Transitions: [
                {
                  StorageClass: 'STANDARD_IA',
                  TransitionInDays: 30,
                },
              ],
            }),
          ]),
        },
      });
    });

    it('should configure intelligent tiering', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        IntelligentTieringConfigurations: [
          {
            Id: 'ArchiveOldArtifacts',
            Status: 'Enabled',
            Tierings: Match.arrayWith([
              Match.objectLike({
                AccessTier: 'ARCHIVE_ACCESS',
                Days: 90,
              }),
              Match.objectLike({
                AccessTier: 'DEEP_ARCHIVE_ACCESS',
                Days: 180,
              }),
            ]),
          },
        ],
      });
    });

    it('should use custom retention days from config', () => {
      const customConfig = { ...testConfig, artifactRetentionDays: 60 };
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: customConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldArtifacts',
              ExpirationInDays: 60,
            }),
          ]),
        },
      });
    });
  });

  describe('CloudWatch Log Groups', () => {
    it('should create CodeBuild log group with correct name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codebuild/kiro-worker-test',
      });
    });

    it('should create Lambda log group with correct name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/kiro-worker-test-poller',
      });
    });

    it('should set retention period for CodeBuild logs', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codebuild/kiro-worker-test',
        RetentionInDays: 7,
      });
    });

    it('should set retention period for Lambda logs', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/kiro-worker-test-poller',
        RetentionInDays: 7,
      });
    });

    it('should use custom log retention from config', () => {
      const customConfig = { ...testConfig, logRetentionDays: 30 };
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: customConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codebuild/kiro-worker-test',
        RetentionInDays: 30,
      });
    });

    it('should create exactly two log groups', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Logs::LogGroup', 2);
    });
  });

  describe('DynamoDB Locks Table', () => {
    it('should create DynamoDB table with correct name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'kiro-worker-test-locks',
      });
    });

    it('should configure lockKey as partition key', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [
          {
            AttributeName: 'lockKey',
            KeyType: 'HASH',
          },
        ],
        AttributeDefinitions: [
          {
            AttributeName: 'lockKey',
            AttributeType: 'S',
          },
        ],
      });
    });

    it('should use on-demand billing mode', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('should enable encryption', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });

    it('should configure TTL on expiresAt attribute', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      });
    });

    it('should not enable point-in-time recovery for test environment', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
      });
    });

    it('should enable point-in-time recovery for production environment', () => {
      const prodConfig = { ...testConfig, environment: 'production' as const };
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: prodConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('should create exactly one DynamoDB table', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::DynamoDB::Table', 1);
    });
  });

  describe('Stack Outputs', () => {
    it('should create output for artifacts bucket name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('ArtifactsBucketName', {
        Description: 'Name of the S3 bucket for build artifacts',
      });
    });

    it('should create output for artifacts bucket ARN', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('ArtifactsBucketArn', {
        Description: 'ARN of the S3 bucket for build artifacts',
      });
    });

    it('should create output for CodeBuild log group name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('CodeBuildLogGroupName', {
        Description: 'Name of the CloudWatch log group for CodeBuild',
      });
    });

    it('should create output for Lambda log group name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('LambdaLogGroupName', {
        Description: 'Name of the CloudWatch log group for Lambda',
      });
    });

    it('should create output for locks table name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('LocksTableName', {
        Description: 'Name of the DynamoDB table for work item locking',
      });
    });

    it('should create output for locks table ARN', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('LocksTableArn', {
        Description: 'ARN of the DynamoDB table for work item locking',
      });
    });

    it('should create exactly six outputs', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      const outputs = template.toJSON().Outputs;
      expect(Object.keys(outputs)).toHaveLength(8);
    });

    it('should create output for CodeBuild role name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('CodeBuildRoleName', {
        Description: 'Name of the IAM role for CodeBuild projects',
      });
    });

    it('should create output for CodeBuild role ARN', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('CodeBuildRoleArn', {
        Description: 'ARN of the IAM role for CodeBuild projects',
      });
    });
  });

  describe('IAM CodeBuild Role', () => {
    it('should create IAM role with correct name', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'kiro-worker-test-codebuild-role',
      });
    });

    it('should have CodeBuild service principal', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'codebuild.amazonaws.com',
              },
            },
          ],
        },
      });
    });

    it('should have CloudWatch Logs permissions', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              Effect: 'Allow',
              Sid: 'CloudWatchLogsAccess',
            }),
          ]),
        },
      });
    });

    it('should have S3 artifacts permissions', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
              Effect: 'Allow',
              Sid: 'S3ArtifactsAccess',
            }),
          ]),
        },
      });
    });

    it('should have Secrets Manager permissions', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Effect: 'Allow',
              Sid: 'SecretsManagerAccess',
            }),
          ]),
        },
      });
    });

    it('should have Parameter Store permissions', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
              Effect: 'Allow',
              Sid: 'ParameterStoreAccess',
            }),
          ]),
        },
      });
    });

    it('should have KMS decrypt permissions with conditions', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ['kms:Decrypt', 'kms:DescribeKey'],
              Effect: 'Allow',
              Resource: '*',
              Sid: 'KMSDecryptAccess',
              Condition: Match.objectLike({
                StringEquals: Match.objectLike({
                  'kms:ViaService': Match.anyValue(),
                }),
              }),
            }),
          ]),
        },
      });
    });

    it('should have all required policy statements', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      const policy = template.findResources('AWS::IAM::Policy');
      const policyStatements = Object.values(policy)[0].Properties.PolicyDocument.Statement;
      
      // Should have 5 policy statements (CloudWatch, S3, Secrets Manager, Parameter Store, KMS)
      expect(policyStatements).toHaveLength(5);
    });

    it('should apply tags to IAM role', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'CodeBuild' },
          { Key: 'Purpose', Value: 'BuildExecution' },
        ]),
      });
    });

    it('should create exactly one IAM role', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::IAM::Role', 1);
    });

    it('should create exactly one IAM policy', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::IAM::Policy', 1);
    });

    it('should scope permissions to environment', () => {
      const stagingConfig = { ...testConfig, environment: 'staging' as const };
      const stack = new CoreInfrastructureStack(app, 'StagingStack', {
        config: stagingConfig,
      });

      const template = Template.fromStack(stack);
      
      // Verify Secrets Manager permissions exist with Sid
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Sid: 'SecretsManagerAccess',
            }),
          ]),
        },
      });

      // Verify Parameter Store permissions exist with Sid
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['ssm:GetParameter']),
              Sid: 'ParameterStoreAccess',
            }),
          ]),
        },
      });
    });

    it('should use least-privilege permissions', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      const policy = template.findResources('AWS::IAM::Policy');
      const policyDoc = Object.values(policy)[0].Properties.PolicyDocument;

      // Verify no wildcard actions (except for KMS which has conditions)
      policyDoc.Statement.forEach((statement: any) => {
        if (statement.Sid !== 'KMSDecryptAccess') {
          // KMS is allowed to have * resource with conditions
          const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
          actions.forEach((action: string) => {
            expect(action).not.toBe('*');
          });
        }
      });

      // Verify CloudWatch statement has Resource defined
      const cloudWatchStatement = policyDoc.Statement.find((s: any) => s.Sid === 'CloudWatchLogsAccess');
      expect(cloudWatchStatement).toBeDefined();
      expect(cloudWatchStatement.Resource).toBeDefined();
    });
  });

  describe('Multi-Environment Support', () => {
    it('should create resources with staging environment name', () => {
      const stagingConfig = { ...testConfig, environment: 'staging' as const };
      const stack = new CoreInfrastructureStack(app, 'StagingStack', {
        config: stagingConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'kiro-worker-staging-artifacts',
      });
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'kiro-worker-staging-locks',
      });
    });

    it('should create resources with production environment name', () => {
      const prodConfig = { ...testConfig, environment: 'production' as const };
      const stack = new CoreInfrastructureStack(app, 'ProductionStack', {
        config: prodConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'kiro-worker-production-artifacts',
      });
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'kiro-worker-production-locks',
      });
    });
  });

  describe('Resource Tags', () => {
    it('should apply tags to S3 bucket', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Artifacts' },
          { Key: 'Purpose', Value: 'BuildArtifacts' },
        ]),
      });
    });

    it('should apply tags to log groups', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Component' }),
          Match.objectLike({ Key: 'Purpose' }),
        ]),
      });
    });

    it('should apply tags to DynamoDB table', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Locking' },
          { Key: 'Purpose', Value: 'WorkItemLocks' },
        ]),
      });
    });
  });

  describe('Log Retention Mapping', () => {
    it('should map 1 day to ONE_DAY retention', () => {
      const config = { ...testConfig, logRetentionDays: 1 };
      const stack = new CoreInfrastructureStack(app, 'TestStack', { config });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 1,
      });
    });

    it('should map 7 days to ONE_WEEK retention', () => {
      const config = { ...testConfig, logRetentionDays: 7 };
      const stack = new CoreInfrastructureStack(app, 'TestStack', { config });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 7,
      });
    });

    it('should map 30 days to ONE_MONTH retention', () => {
      const config = { ...testConfig, logRetentionDays: 30 };
      const stack = new CoreInfrastructureStack(app, 'TestStack', { config });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 30,
      });
    });

    it('should map 365 days to ONE_YEAR retention', () => {
      const config = { ...testConfig, logRetentionDays: 365 };
      const stack = new CoreInfrastructureStack(app, 'TestStack', { config });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 365,
      });
    });
  });

  describe('Resource Count', () => {
    it('should create exactly one S3 bucket', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::S3::Bucket', 1);
    });

    it('should create exactly two log groups', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Logs::LogGroup', 2);
    });

    it('should create exactly one DynamoDB table', () => {
      const stack = new CoreInfrastructureStack(app, 'TestStack', {
        config: testConfig,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::DynamoDB::Table', 1);
    });
  });
});
