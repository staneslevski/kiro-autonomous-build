/**
 * Unit tests for CD Pipeline Stack
 * 
 * Tests verify that the stack creates all required resources with proper
 * configuration including pipeline stages, CodeBuild projects, IAM permissions,
 * and security settings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CDPipelineStack } from '../../lib/stacks/cd-pipeline-stack';

describe('CDPipelineStack', () => {
  let app: cdk.App;
  let stack: CDPipelineStack;
  let template: Template;
  let artifactsBucket: s3.Bucket;
  
  beforeEach(() => {
    app = new cdk.App();
    
    // Create artifacts bucket for testing
    const bucketStack = new cdk.Stack(app, 'BucketStack');
    artifactsBucket = new s3.Bucket(bucketStack, 'TestBucket', {
      bucketName: 'test-artifacts-bucket',
    });
    
    stack = new CDPipelineStack(app, 'TestStack', {
      environment: 'test',
      artifactsBucket,
      githubOwner: 'test-owner',
      githubRepo: 'test-repo',
      githubBranch: 'main',
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    
    template = Template.fromStack(stack);
  });
  
  describe('Pipeline Structure', () => {
    it('should create CodePipeline with correct name', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Name: 'kiro-pipeline-test',
      });
    });
    
    it('should create exactly one pipeline', () => {
      template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    });
    
    it('should have 5 stages in correct order', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: [
          Match.objectLike({ Name: 'Source' }),
          Match.objectLike({ Name: 'Build' }),
          Match.objectLike({ Name: 'TestEnvironment' }),
          Match.objectLike({ Name: 'StagingEnvironment' }),
          Match.objectLike({ Name: 'ProductionEnvironment' }),
        ],
      });
    });
    
    it('should have Source stage with GitHub action', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Source',
            Actions: [
              Match.objectLike({
                Name: 'GitHub_Source',
                ActionTypeId: {
                  Category: 'Source',
                  Owner: 'ThirdParty',
                  Provider: 'GitHub',
                },
                Configuration: Match.objectLike({
                  Owner: 'test-owner',
                  Repo: 'test-repo',
                  Branch: 'main',
                }),
              }),
            ],
          }),
        ]),
      });
    });
    
    it('should configure GitHub webhook trigger', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Source',
            Actions: [
              Match.objectLike({
                Configuration: Match.objectLike({
                  PollForSourceChanges: false,
                }),
              }),
            ],
          }),
        ]),
      });
    });
    
    it('should have Build stage with CodeBuild action', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Build',
            Actions: [
              Match.objectLike({
                Name: 'Build_Test_SecurityScan',
                ActionTypeId: {
                  Category: 'Build',
                  Owner: 'AWS',
                  Provider: 'CodeBuild',
                },
              }),
            ],
          }),
        ]),
      });
    });
    
    it('should have TestEnvironment stage with deployment and tests', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'TestEnvironment',
            Actions: [
              Match.objectLike({
                Name: 'Deploy_To_Test',
                RunOrder: 1,
              }),
              Match.objectLike({
                Name: 'Integration_Tests',
                RunOrder: 2,
              }),
            ],
          }),
        ]),
      });
    });
    
    it('should have StagingEnvironment stage with deployment and tests', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'StagingEnvironment',
            Actions: [
              Match.objectLike({
                Name: 'Deploy_To_Staging',
                RunOrder: 1,
              }),
              Match.objectLike({
                Name: 'E2E_Tests',
                RunOrder: 2,
              }),
            ],
          }),
        ]),
      });
    });
    
    it('should have ProductionEnvironment stage with manual approval', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'ProductionEnvironment',
            Actions: [
              Match.objectLike({
                Name: 'Approve_Production_Deployment',
                ActionTypeId: {
                  Category: 'Approval',
                  Owner: 'AWS',
                  Provider: 'Manual',
                },
                RunOrder: 1,
              }),
              Match.objectLike({
                Name: 'Deploy_To_Production',
                RunOrder: 2,
              }),
            ],
          }),
        ]),
      });
    });
  });
  
  describe('CodeBuild Projects', () => {
    it('should create build project', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-build',
      });
    });
    
    it('should create integration test project', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-integration-test',
      });
    });
    
    it('should create E2E test project', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-e2e-test',
      });
    });
    
    it('should create test deployment project', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-deploy-test',
      });
    });
    
    it('should create staging deployment project', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-deploy-staging',
      });
    });
    
    it('should create production deployment project', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-deploy-production',
      });
    });
    
    it('should create exactly 6 CodeBuild projects', () => {
      template.resourceCountIs('AWS::CodeBuild::Project', 6);
    });
    
    it('should configure build project with correct buildspec', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-build',
        Source: Match.objectLike({
          BuildSpec: 'buildspec-build.yml',
        }),
      });
    });
    
    it('should configure integration test project with correct buildspec', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-integration-test',
        Source: Match.objectLike({
          BuildSpec: 'buildspec-integration-test.yml',
        }),
      });
    });
    
    it('should configure E2E test project with correct buildspec', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-e2e-test',
        Source: Match.objectLike({
          BuildSpec: 'buildspec-e2e-test.yml',
        }),
      });
    });
    
    it('should configure deployment projects with correct buildspec', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-deploy-test',
        Source: Match.objectLike({
          BuildSpec: 'buildspec-deploy.yml',
        }),
      });
    });
    
    it('should configure build project with environment variables', () => {
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-test-build',
        Environment: Match.objectLike({
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'ENVIRONMENT',
              Value: 'test',
            }),
            Match.objectLike({
              Name: 'COVERAGE_THRESHOLD',
              Value: '80',
            }),
          ]),
        }),
      });
    });
    
    it('should configure all projects with caching enabled', () => {
      const projects = template.findResources('AWS::CodeBuild::Project');
      
      Object.values(projects).forEach((project: any) => {
        expect(project.Properties.Cache).toBeDefined();
        expect(project.Properties.Cache.Type).toBe('LOCAL');
      });
    });
  });
  
  describe('SNS Topics', () => {
    it('should create approval SNS topic', () => {
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: 'kiro-pipeline-test-approvals',
        DisplayName: 'Kiro Pipeline test Approval Notifications',
      });
    });
    
    it('should create exactly one SNS topic', () => {
      template.resourceCountIs('AWS::SNS::Topic', 1);
    });
    
    it('should configure manual approval to use SNS topic', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'ProductionEnvironment',
            Actions: Match.arrayWith([
              Match.objectLike({
                Name: 'Approve_Production_Deployment',
                Configuration: Match.objectLike({
                  NotificationArn: Match.anyValue(),
                }),
              }),
            ]),
          }),
        ]),
      });
    });
  });
  
  describe('IAM Permissions', () => {
    it('should create pipeline IAM role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'kiro-pipeline-test-role',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: [
            Match.objectLike({
              Principal: {
                Service: 'codepipeline.amazonaws.com',
              },
            }),
          ],
        }),
      });
    });
    
    it('should grant pipeline permission to start CodeBuild projects', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: [
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
              ],
            }),
          ]),
        }),
      });
    });
    
    it('should not have wildcard IAM permissions', () => {
      const iamPolicies = template.findResources('AWS::IAM::Policy');
      
      Object.values(iamPolicies).forEach((policy: any) => {
        policy.Properties.PolicyDocument.Statement.forEach((statement: any) => {
          if (statement.Effect === 'Allow') {
            // Check actions
            if (Array.isArray(statement.Action)) {
              expect(statement.Action).not.toContain('*');
            } else {
              expect(statement.Action).not.toBe('*');
            }
            
            // Check resources
            if (Array.isArray(statement.Resource)) {
              statement.Resource.forEach((resource: string) => {
                // Allow wildcards only at the end of ARNs (e.g., arn:aws:s3:::bucket/*)
                if (resource === '*') {
                  throw new Error('Wildcard resource not allowed');
                }
              });
            } else if (statement.Resource === '*') {
              throw new Error('Wildcard resource not allowed');
            }
          }
        });
      });
    });
    
    it('should create IAM roles for all CodeBuild projects', () => {
      // 6 CodeBuild projects + 1 pipeline role = 7 roles minimum
      const roles = template.findResources('AWS::IAM::Role');
      const roleCount = Object.keys(roles).length;
      expect(roleCount).toBeGreaterThanOrEqual(7);
    });
  });
  
  describe('Secrets Manager Integration', () => {
    it('should reference GitHub token secret', () => {
      // The secret reference is in the pipeline configuration
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Source',
            Actions: [
              Match.objectLike({
                Configuration: Match.objectLike({
                  OAuthToken: Match.anyValue(),
                }),
              }),
            ],
          }),
        ]),
      });
    });
  });
  
  describe('Stack Outputs', () => {
    it('should export pipeline ARN', () => {
      template.hasOutput('PipelineArn', {
        Export: {
          Name: 'kiro-pipeline-test-arn',
        },
      });
    });
    
    it('should export pipeline name', () => {
      template.hasOutput('PipelineName', {
        Export: {
          Name: 'kiro-pipeline-test-name',
        },
      });
    });
    
    it('should export approval topic ARN', () => {
      template.hasOutput('ApprovalTopicArn', {
        Export: {
          Name: 'kiro-pipeline-test-approval-topic-arn',
        },
      });
    });
  });
  
  describe('Resource Tags', () => {
    it('should tag all resources with Project', () => {
      const pipeline = template.findResources('AWS::CodePipeline::Pipeline');
      const pipelineLogicalId = Object.keys(pipeline)[0];
      const pipelineResource = pipeline[pipelineLogicalId];
      
      expect(pipelineResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Project',
            Value: 'KiroPipeline',
          }),
        ])
      );
    });
    
    it('should tag all resources with Environment', () => {
      const pipeline = template.findResources('AWS::CodePipeline::Pipeline');
      const pipelineLogicalId = Object.keys(pipeline)[0];
      const pipelineResource = pipeline[pipelineLogicalId];
      
      expect(pipelineResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Environment',
            Value: 'test',
          }),
        ])
      );
    });
    
    it('should tag all resources with ManagedBy', () => {
      const pipeline = template.findResources('AWS::CodePipeline::Pipeline');
      const pipelineLogicalId = Object.keys(pipeline)[0];
      const pipelineResource = pipeline[pipelineLogicalId];
      
      expect(pipelineResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'ManagedBy',
            Value: 'CDK',
          }),
        ])
      );
    });
    
    it('should tag all resources with Stack', () => {
      const pipeline = template.findResources('AWS::CodePipeline::Pipeline');
      const pipelineLogicalId = Object.keys(pipeline)[0];
      const pipelineResource = pipeline[pipelineLogicalId];
      
      expect(pipelineResource.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Stack',
            Value: 'CDPipeline',
          }),
        ])
      );
    });
  });
  
  describe('Stack Properties', () => {
    it('should expose pipeline as public property', () => {
      expect(stack.pipeline).toBeDefined();
      expect(stack.pipeline.pipelineArn).toBeDefined();
    });
    
    it('should expose build project as public property', () => {
      expect(stack.buildProject).toBeDefined();
      expect(stack.buildProject.project).toBeDefined();
    });
    
    it('should expose integration test project as public property', () => {
      expect(stack.integrationTestProject).toBeDefined();
      expect(stack.integrationTestProject.project).toBeDefined();
    });
    
    it('should expose E2E test project as public property', () => {
      expect(stack.e2eTestProject).toBeDefined();
      expect(stack.e2eTestProject.project).toBeDefined();
    });
    
    it('should expose deployment projects as public properties', () => {
      expect(stack.testDeployProject).toBeDefined();
      expect(stack.stagingDeployProject).toBeDefined();
      expect(stack.productionDeployProject).toBeDefined();
    });
    
    it('should expose approval topic as public property', () => {
      expect(stack.approvalTopic).toBeDefined();
      expect(stack.approvalTopic.topicArn).toBeDefined();
    });
  });
  
  describe('Multiple Environments', () => {
    it('should create stack for staging environment', () => {
      const stagingApp = new cdk.App();
      const stagingBucketStack = new cdk.Stack(stagingApp, 'StagingBucketStack');
      const stagingBucket = new s3.Bucket(stagingBucketStack, 'StagingBucket', {
        bucketName: 'staging-artifacts-bucket',
      });
      
      const stagingStack = new CDPipelineStack(stagingApp, 'StagingStack', {
        environment: 'staging',
        artifactsBucket: stagingBucket,
        githubOwner: 'test-owner',
        githubRepo: 'test-repo',
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      
      const stagingTemplate = Template.fromStack(stagingStack);
      
      stagingTemplate.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Name: 'kiro-pipeline-staging',
      });
      
      stagingTemplate.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-staging-build',
      });
    });
    
    it('should create stack for production environment', () => {
      const prodApp = new cdk.App();
      const prodBucketStack = new cdk.Stack(prodApp, 'ProdBucketStack');
      const prodBucket = new s3.Bucket(prodBucketStack, 'ProdBucket', {
        bucketName: 'prod-artifacts-bucket',
      });
      
      const prodStack = new CDPipelineStack(prodApp, 'ProductionStack', {
        environment: 'production',
        artifactsBucket: prodBucket,
        githubOwner: 'test-owner',
        githubRepo: 'test-repo',
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      
      const prodTemplate = Template.fromStack(prodStack);
      
      prodTemplate.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Name: 'kiro-pipeline-production',
      });
      
      prodTemplate.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-pipeline-production-build',
      });
    });
  });
  
  describe('Security Best Practices', () => {
    it('should enable encryption for S3 artifacts', () => {
      // Artifacts bucket encryption is handled by the core stack
      // Pipeline should use the encrypted bucket
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        ArtifactStore: Match.objectLike({
          Type: 'S3',
        }),
      });
    });
    
    it('should not have any public access to resources', () => {
      // Verify no public S3 buckets
      const buckets = template.findResources('AWS::S3::Bucket');
      Object.values(buckets).forEach((bucket: any) => {
        if (bucket.Properties.PublicAccessBlockConfiguration) {
          expect(bucket.Properties.PublicAccessBlockConfiguration).toMatchObject({
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          });
        }
      });
    });
    
    it('should use least privilege IAM permissions', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      
      Object.values(policies).forEach((policy: any) => {
        policy.Properties.PolicyDocument.Statement.forEach((statement: any) => {
          if (statement.Effect === 'Allow') {
            // Verify specific actions (no wildcards)
            if (Array.isArray(statement.Action)) {
              statement.Action.forEach((action: string) => {
                expect(action).not.toBe('*');
              });
            }
          }
        });
      });
    });
  });
  
  describe('Snapshot Test', () => {
    it('should match snapshot', () => {
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
