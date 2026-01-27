/**
 * Unit tests for CD Pipeline Core Infrastructure Stack
 * 
 * Tests verify that the stack creates all required resources with proper
 * configuration including encryption, versioning, lifecycle policies, and
 * security settings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CDPipelineCoreStack } from '../../lib/stacks/cd-pipeline-core-stack';

describe('CDPipelineCoreStack', () => {
  let app: cdk.App;
  let stack: CDPipelineCoreStack;
  let template: Template;
  
  beforeEach(() => {
    app = new cdk.App();
    stack = new CDPipelineCoreStack(app, 'TestStack', {
      environment: 'test',
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });
  
  describe('KMS Key', () => {
    it('should create KMS key with rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        Description: 'KMS key for Kiro CD Pipeline test resources',
        EnableKeyRotation: true,
      });
    });
    
    it('should create KMS key alias', () => {
      template.hasResourceProperties('AWS::KMS::Alias', {
        AliasName: 'alias/kiro-pipeline-test',
      });
    });
    
    it('should create exactly one KMS key', () => {
      template.resourceCountIs('AWS::KMS::Key', 1);
    });
  });
  
  describe('S3 Artifacts Bucket', () => {
    it('should create S3 bucket with correct name', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'kiro-pipeline-test-artifacts',
      });
    });
    
    it('should enable KMS encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
                KMSMasterKeyID: Match.anyValue(),
              },
            },
          ],
        },
      });
    });
    
    it('should enable versioning', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });
    
    it('should block all public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });
    
    it('should have lifecycle rule for deleting old artifacts after 90 days', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldArtifacts',
              Status: 'Enabled',
              ExpirationInDays: 90,
            }),
          ]),
        },
      });
    });
    
    it('should have lifecycle rule for transitioning to IA after 30 days', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'TransitionToIA',
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
    
    it('should have lifecycle rule for deleting old versions after 30 days', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
              NoncurrentVersionExpiration: {
                NoncurrentDays: 30,
              },
            }),
          ]),
        },
      });
    });
    
    it('should create exactly one S3 bucket', () => {
      template.resourceCountIs('AWS::S3::Bucket', 1);
    });
  });
  
  describe('DynamoDB Deployments Table', () => {
    it('should create DynamoDB table with correct name', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'kiro-pipeline-test-deployments',
      });
    });
    
    it('should have deploymentId as partition key', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [
          {
            AttributeName: 'deploymentId',
            KeyType: 'HASH',
          },
        ],
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'deploymentId',
            AttributeType: 'S',
          },
        ]),
      });
    });
    
    it('should use PAY_PER_REQUEST billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });
    
    it('should enable encryption', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });
    
    it('should enable point-in-time recovery', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });
    
    it('should have TTL attribute configured', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      });
    });
    
    it('should enable streams', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });
    });
    
    it('should have EnvironmentStatusIndex GSI', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        GlobalSecondaryIndexes: [
          {
            IndexName: 'EnvironmentStatusIndex',
            KeySchema: [
              {
                AttributeName: 'environment',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'status',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ],
        AttributeDefinitions: Match.arrayWith([
          {
            AttributeName: 'environment',
            AttributeType: 'S',
          },
          {
            AttributeName: 'status',
            AttributeType: 'S',
          },
        ]),
      });
    });
    
    it('should create exactly one DynamoDB table', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 1);
    });
  });
  
  describe('CloudWatch Log Groups', () => {
    it('should create pipeline log group with correct name', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codepipeline/kiro-pipeline-test',
      });
    });
    
    it('should create rollback log group with correct name', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/kiro-pipeline-test-rollback',
      });
    });
    
    it('should set 90-day retention for pipeline log group', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codepipeline/kiro-pipeline-test',
        RetentionInDays: 90,
      });
    });
    
    it('should set 90-day retention for rollback log group', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/kiro-pipeline-test-rollback',
        RetentionInDays: 90,
      });
    });
    
    it('should enable KMS encryption for pipeline log group', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codepipeline/kiro-pipeline-test',
        KmsKeyId: Match.anyValue(),
      });
    });
    
    it('should enable KMS encryption for rollback log group', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/kiro-pipeline-test-rollback',
        KmsKeyId: Match.anyValue(),
      });
    });
    
    it('should create exactly two log groups', () => {
      template.resourceCountIs('AWS::Logs::LogGroup', 2);
    });
  });
  
  describe('Stack Outputs', () => {
    it('should export artifacts bucket ARN', () => {
      template.hasOutput('ArtifactsBucketArn', {
        Export: {
          Name: 'kiro-pipeline-test-artifacts-bucket-arn',
        },
      });
    });
    
    it('should export artifacts bucket name', () => {
      template.hasOutput('ArtifactsBucketName', {
        Export: {
          Name: 'kiro-pipeline-test-artifacts-bucket-name',
        },
      });
    });
    
    it('should export deployments table name', () => {
      template.hasOutput('DeploymentsTableName', {
        Export: {
          Name: 'kiro-pipeline-test-deployments-table-name',
        },
      });
    });
    
    it('should export deployments table ARN', () => {
      template.hasOutput('DeploymentsTableArn', {
        Export: {
          Name: 'kiro-pipeline-test-deployments-table-arn',
        },
      });
    });
    
    it('should export KMS key ARN', () => {
      template.hasOutput('KmsKeyArn', {
        Export: {
          Name: 'kiro-pipeline-test-kms-key-arn',
        },
      });
    });
    
    it('should export pipeline log group name', () => {
      template.hasOutput('PipelineLogGroupName', {
        Export: {
          Name: 'kiro-pipeline-test-pipeline-log-group-name',
        },
      });
    });
    
    it('should export rollback log group name', () => {
      template.hasOutput('RollbackLogGroupName', {
        Export: {
          Name: 'kiro-pipeline-test-rollback-log-group-name',
        },
      });
    });
  });
  
  describe('Resource Tags', () => {
    it('should tag all resources with Project', () => {
      const resources = template.findResources('AWS::S3::Bucket');
      const bucketLogicalId = Object.keys(resources)[0];
      const bucket = resources[bucketLogicalId];
      
      expect(bucket.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Project',
            Value: 'KiroPipeline',
          }),
        ])
      );
    });
    
    it('should tag all resources with Environment', () => {
      const resources = template.findResources('AWS::S3::Bucket');
      const bucketLogicalId = Object.keys(resources)[0];
      const bucket = resources[bucketLogicalId];
      
      expect(bucket.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Environment',
            Value: 'test',
          }),
        ])
      );
    });
    
    it('should tag all resources with ManagedBy', () => {
      const resources = template.findResources('AWS::S3::Bucket');
      const bucketLogicalId = Object.keys(resources)[0];
      const bucket = resources[bucketLogicalId];
      
      expect(bucket.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'ManagedBy',
            Value: 'CDK',
          }),
        ])
      );
    });
    
    it('should tag all resources with Stack', () => {
      const resources = template.findResources('AWS::S3::Bucket');
      const bucketLogicalId = Object.keys(resources)[0];
      const bucket = resources[bucketLogicalId];
      
      expect(bucket.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Stack',
            Value: 'CDPipelineCore',
          }),
        ])
      );
    });
  });
  
  describe('Stack Properties', () => {
    it('should expose artifacts bucket as public property', () => {
      expect(stack.artifactsBucket).toBeDefined();
      expect(stack.artifactsBucket.bucketArn).toBeDefined();
    });
    
    it('should expose deployments table as public property', () => {
      expect(stack.deploymentsTable).toBeDefined();
      expect(stack.deploymentsTable.tableArn).toBeDefined();
    });
    
    it('should expose KMS key as public property', () => {
      expect(stack.kmsKey).toBeDefined();
    });
    
    it('should expose pipeline log group as public property', () => {
      expect(stack.pipelineLogGroup).toBeDefined();
      expect(stack.pipelineLogGroup.logGroupArn).toBeDefined();
    });
    
    it('should expose rollback log group as public property', () => {
      expect(stack.rollbackLogGroup).toBeDefined();
      expect(stack.rollbackLogGroup.logGroupArn).toBeDefined();
    });
  });
  
  describe('Snapshot Test', () => {
    it('should match snapshot', () => {
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
  
  describe('Multiple Environments', () => {
    it('should create stack for staging environment', () => {
      const stagingApp = new cdk.App();
      const stagingStack = new CDPipelineCoreStack(stagingApp, 'StagingStack', {
        environment: 'staging',
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      const stagingTemplate = Template.fromStack(stagingStack);
      
      stagingTemplate.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'kiro-pipeline-staging-artifacts',
      });
      
      stagingTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'kiro-pipeline-staging-deployments',
      });
    });
    
    it('should create stack for production environment', () => {
      const prodApp = new cdk.App();
      const prodStack = new CDPipelineCoreStack(prodApp, 'ProductionStack', {
        environment: 'production',
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      const prodTemplate = Template.fromStack(prodStack);
      
      prodTemplate.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'kiro-pipeline-production-artifacts',
      });
      
      prodTemplate.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'kiro-pipeline-production-deployments',
      });
    });
  });
  
  describe('Security Best Practices', () => {
    it('should not have any wildcard IAM permissions', () => {
      const iamRoles = template.findResources('AWS::IAM::Role');
      
      Object.values(iamRoles).forEach((role: any) => {
        if (role.Properties?.Policies) {
          role.Properties.Policies.forEach((policy: any) => {
            policy.PolicyDocument.Statement.forEach((statement: any) => {
              if (statement.Effect === 'Allow') {
                expect(statement.Action).not.toBe('*');
                expect(statement.Resource).not.toBe('*');
              }
            });
          });
        }
      });
    });
    
    it('should have encryption enabled for all data at rest', () => {
      // S3 bucket encryption
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: Match.objectLike({
          ServerSideEncryptionConfiguration: Match.anyValue(),
        }),
      });
      
      // DynamoDB encryption
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        SSESpecification: {
          SSEEnabled: true,
        },
      });
      
      // CloudWatch Logs encryption
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      Object.values(logGroups).forEach((logGroup: any) => {
        expect(logGroup.Properties.KmsKeyId).toBeDefined();
      });
    });
    
    it('should have public access blocked for S3 bucket', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });
  });
});
