/**
 * Unit tests for PipelineCodeBuildConstruct
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineCodeBuildConstruct } from '../../lib/constructs/pipeline-codebuild-construct';

describe('PipelineCodeBuildConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let artifactsBucket: s3.IBucket;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1'
      }
    });

    // Create mock artifacts bucket
    artifactsBucket = new s3.Bucket(stack, 'ArtifactsBucket', {
      bucketName: 'test-artifacts-bucket',
      encryption: s3.BucketEncryption.S3_MANAGED
    });
  });

  describe('Basic Construction', () => {
    it('should create a CodeBuild project with correct name', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'test-build-project'
      });
    });

    it('should create a CodeBuild project with description', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Description: 'CodeBuild project for test environment - test-build-project'
      });
    });
  });

  describe('Build Environment Configuration', () => {
    it('should configure build environment with STANDARD_7_0 image', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: {
          Image: 'aws/codebuild/standard:7.0',
          Type: 'LINUX_CONTAINER',
          ComputeType: 'BUILD_GENERAL1_SMALL',
          PrivilegedMode: false
        }
      });
    });

    it('should configure build environment with SMALL compute type', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: {
          ComputeType: 'BUILD_GENERAL1_SMALL'
        }
      });
    });

    it('should accept custom environment variables', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket,
        environmentVariables: {
          CUSTOM_VAR: { value: 'custom-value' },
          ANOTHER_VAR: { value: 'another-value' }
        }
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: {
          EnvironmentVariables: Match.arrayWith([
            {
              Name: 'CUSTOM_VAR',
              Type: 'PLAINTEXT',
              Value: 'custom-value'
            },
            {
              Name: 'ANOTHER_VAR',
              Type: 'PLAINTEXT',
              Value: 'another-value'
            }
          ])
        }
      });
    });
  });

  describe('Caching Configuration', () => {
    it('should enable all three cache modes (SOURCE, DOCKER_LAYER, CUSTOM)', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Cache: {
          Type: 'LOCAL',
          Modes: Match.arrayWith([
            'LOCAL_SOURCE_CACHE',
            'LOCAL_DOCKER_LAYER_CACHE',
            'LOCAL_CUSTOM_CACHE'
          ])
        }
      });
    });

    it('should have exactly 3 cache modes enabled', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      const projects = template.findResources('AWS::CodeBuild::Project');
      const projectKeys = Object.keys(projects);
      expect(projectKeys.length).toBeGreaterThan(0);
      
      const project = projects[projectKeys[0]];
      expect(project.Properties.Cache.Modes).toHaveLength(3);
    });
  });

  describe('Logging Configuration', () => {
    it('should create CloudWatch log group with correct name', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/codebuild/test-build-project',
        RetentionInDays: 90
      });
    });

    it('should configure CloudWatch logging in CodeBuild project', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        LogsConfig: {
          CloudWatchLogs: {
            Status: 'ENABLED',
            GroupName: Match.objectLike({
              Ref: Match.stringLikeRegexp('TestConstructLogGroup')
            })
          }
        }
      });
    });

    it('should use provided log group if specified', () => {
      const customLogGroup = new logs.LogGroup(stack, 'CustomLogGroup', {
        logGroupName: '/custom/log/group',
        retention: logs.RetentionDays.ONE_WEEK
      });

      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket,
        logGroup: customLogGroup
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        LogsConfig: {
          CloudWatchLogs: {
            Status: 'ENABLED',
            GroupName: Match.objectLike({
              Ref: Match.stringLikeRegexp('CustomLogGroup')
            })
          }
        }
      });
    });
  });

  describe('IAM Permissions', () => {
    it('should create IAM role with least privilege CloudWatch Logs permissions', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('log-group:/aws/codebuild/test-build-project')
              ])
            })
          ])
        }
      });
    });

    it('should have specific S3 permissions (no wildcards)', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:PutObject'
              ]
            })
          ])
        }
      });
    });

    it('should have Secrets Manager permissions scoped to environment', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'secretsmanager:GetSecretValue',
              Resource: Match.stringLikeRegexp('kiro-pipeline-test-')
            })
          ])
        }
      });
    });

    it('should have STS AssumeRole permissions for CDK deployments', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'sts:AssumeRole',
              Resource: Match.stringLikeRegexp('role/cdk-')
            })
          ])
        }
      });
    });

    it('should not have wildcard actions in IAM policies', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      const policies = template.findResources('AWS::IAM::Policy');
      
      Object.values(policies).forEach((policy: any) => {
        const statements = policy.Properties.PolicyDocument.Statement;
        statements.forEach((statement: any) => {
          if (Array.isArray(statement.Action)) {
            expect(statement.Action).not.toContain('*');
          } else {
            expect(statement.Action).not.toBe('*');
          }
        });
      });
    });

    it('should use provided IAM role if specified', () => {
      const customRole = new iam.Role(stack, 'CustomRole', {
        assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
        roleName: 'custom-codebuild-role'
      });

      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket,
        role: customRole
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        ServiceRole: {
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('CustomRole')
          ])
        }
      });
    });
  });

  describe('Timeout Settings', () => {
    it('should set build timeout to 60 minutes', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        TimeoutInMinutes: 60
      });
    });

    it('should set queued timeout to 8 hours (480 minutes)', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        QueuedTimeoutInMinutes: 480
      });
    });
  });

  describe('BuildSpec Configuration', () => {
    it('should use specified buildspec file path', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'custom-buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Source: {
          Type: 'GITHUB',
          BuildSpec: 'custom-buildspec.yml'
        }
      });
    });
  });

  describe('Stack Outputs', () => {
    it('should export project ARN', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      // Check that an output exists with the project ARN
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);
      
      const arnOutput = outputKeys.find(key => key.includes('ProjectArn'));
      expect(arnOutput).toBeDefined();
      expect(outputs[arnOutput!].Description).toContain('ARN of CodeBuild project');
    });

    it('should export project name', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      // Check that an output exists with the project name
      const outputs = template.findOutputs('*');
      const outputKeys = Object.keys(outputs);
      
      const nameOutput = outputKeys.find(key => key.includes('ProjectName'));
      expect(nameOutput).toBeDefined();
      expect(outputs[nameOutput!].Description).toContain('Name of CodeBuild project');
    });
  });

  describe('Snapshot Tests', () => {
    it('should match snapshot for basic configuration', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });

    it('should match snapshot with custom environment variables', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'production',
        buildSpecPath: 'buildspec-prod.yml',
        artifactsBucket,
        environmentVariables: {
          ENV: { value: 'production' },
          REGION: { value: 'us-east-1' }
        }
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });

  describe('Resource Count', () => {
    it('should create exactly one CodeBuild project', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::CodeBuild::Project', 1);
    });

    it('should create exactly one IAM role when not provided', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      // Count roles created by the construct (excluding bucket role)
      const roles = template.findResources('AWS::IAM::Role', {
        Properties: {
          RoleName: 'test-build-project-role'
        }
      });
      
      expect(Object.keys(roles).length).toBe(1);
    });

    it('should create exactly one log group when not provided', () => {
      new PipelineCodeBuildConstruct(stack, 'TestConstruct', {
        projectName: 'test-build-project',
        environment: 'test',
        buildSpecPath: 'buildspec.yml',
        artifactsBucket
      });

      const template = Template.fromStack(stack);
      
      const logGroups = template.findResources('AWS::Logs::LogGroup', {
        Properties: {
          LogGroupName: '/aws/codebuild/test-build-project'
        }
      });
      
      expect(Object.keys(logGroups).length).toBe(1);
    });
  });
});
