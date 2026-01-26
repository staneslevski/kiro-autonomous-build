/**
 * Unit tests for CodeBuildProjectsStack
 * 
 * Tests CodeBuild project creation, environment configuration, IAM roles,
 * and CloudFormation template validity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CodeBuildProjectsStack } from '../../lib/stacks/codebuild-projects-stack';
import { EnvironmentConfig } from '../../lib/config/environments';

describe('CodeBuildProjectsStack', () => {
  let app: cdk.App;
  let testConfig: EnvironmentConfig;
  let mockArtifactsBucket: s3.IBucket;
  let mockLogGroup: logs.ILogGroup;
  let mockRole: iam.IRole;

  beforeEach(() => {
    app = new cdk.App();
    
    // Create test configuration
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

    // Create mock resources from CoreInfrastructureStack
    const mockStack = new cdk.Stack(app, 'MockStack');
    
    mockArtifactsBucket = s3.Bucket.fromBucketName(
      mockStack,
      'MockBucket',
      'kiro-worker-test-artifacts'
    );
    
    mockLogGroup = logs.LogGroup.fromLogGroupName(
      mockStack,
      'MockLogGroup',
      '/aws/codebuild/kiro-worker-test'
    );
    
    mockRole = iam.Role.fromRoleArn(
      mockStack,
      'MockRole',
      'arn:aws:iam::123456789012:role/kiro-worker-test-codebuild-role'
    );
  });

  describe('Stack Creation', () => {
    it('should create stack successfully with valid configuration', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      expect(stack).toBeDefined();
      expect(stack.project).toBeDefined();
    });

    it('should create stack with staging environment configuration', () => {
      const stagingConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'staging',
        codeBuildComputeType: 'MEDIUM',
        codeBuildTimeout: 90,
      };

      const stack = new CodeBuildProjectsStack(app, 'StagingStack', {
        config: stagingConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      expect(stack).toBeDefined();
      expect(stack.project).toBeDefined();
    });

    it('should create stack with production environment configuration', () => {
      const prodConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'production',
        codeBuildComputeType: 'LARGE',
        codeBuildTimeout: 120,
      };

      const stack = new CodeBuildProjectsStack(app, 'ProdStack', {
        config: prodConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      expect(stack).toBeDefined();
      expect(stack.project).toBeDefined();
    });
  });

  describe('CodeBuild Project Configuration', () => {
    it('should create CodeBuild project with correct name', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'kiro-worker-test',
      });
    });

    it('should configure SMALL compute type by default', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          ComputeType: 'BUILD_GENERAL1_SMALL',
        }),
      });
    });

    it('should configure MEDIUM compute type when specified', () => {
      const mediumConfig = { ...testConfig, codeBuildComputeType: 'MEDIUM' as const };
      
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: mediumConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          ComputeType: 'BUILD_GENERAL1_MEDIUM',
        }),
      });
    });

    it('should configure LARGE compute type when specified', () => {
      const largeConfig = { ...testConfig, codeBuildComputeType: 'LARGE' as const };
      
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: largeConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          ComputeType: 'BUILD_GENERAL1_LARGE',
        }),
      });
    });

    it('should configure 60 minute timeout by default', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        TimeoutInMinutes: 60,
      });
    });

    it('should configure custom timeout when specified', () => {
      const customConfig = { ...testConfig, codeBuildTimeout: 120 };
      
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: customConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        TimeoutInMinutes: 120,
      });
    });

    it('should use Standard 7.0 Linux build image', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          Image: 'aws/codebuild/standard:7.0',
          Type: 'LINUX_CONTAINER',
        }),
      });
    });

    it('should not enable privileged mode', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          PrivilegedMode: false,
        }),
      });
    });

    it('should reference buildspec.yml from repository', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Source: Match.objectLike({
          BuildSpec: 'buildspec.yml',
        }),
      });
    });

    it('should set concurrent build limit to 1', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        ConcurrentBuildLimit: 1,
      });
    });
  });

  describe('Environment Variables', () => {
    it('should configure ENVIRONMENT variable', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'ENVIRONMENT',
              Type: 'PLAINTEXT',
              Value: 'test',
            }),
          ]),
        }),
      });
    });

    it('should configure COVERAGE_THRESHOLD variable', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'COVERAGE_THRESHOLD',
              Type: 'PLAINTEXT',
              Value: '80',
            }),
          ]),
        }),
      });
    });

    it('should configure BRANCH_NAME variable with empty default', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'BRANCH_NAME',
              Type: 'PLAINTEXT',
              Value: '',
            }),
          ]),
        }),
      });
    });

    it('should configure SPEC_PATH variable with empty default', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'SPEC_PATH',
              Type: 'PLAINTEXT',
              Value: '',
            }),
          ]),
        }),
      });
    });

    it('should configure WORK_ITEM_ID variable with empty default', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Environment: Match.objectLike({
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'WORK_ITEM_ID',
              Type: 'PLAINTEXT',
              Value: '',
            }),
          ]),
        }),
      });
    });
  });

  describe('Artifacts Configuration', () => {
    it('should configure S3 artifacts with build ID', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Artifacts: Match.objectLike({
          Type: 'S3',
          NamespaceType: 'BUILD_ID',
          Packaging: 'NONE',
        }),
      });
    });

    it('should configure artifacts path with environment prefix', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Artifacts: Match.objectLike({
          Path: 'test/',
          Name: 'artifacts',
        }),
      });
    });
  });

  describe('Logging Configuration', () => {
    it('should enable CloudWatch Logs', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        LogsConfig: Match.objectLike({
          CloudWatchLogs: Match.objectLike({
            Status: 'ENABLED',
          }),
        }),
      });
    });
  });

  describe('Cache Configuration', () => {
    it('should enable local caching for source and custom', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Cache: Match.objectLike({
          Type: 'LOCAL',
          Modes: Match.arrayWith(['LOCAL_SOURCE_CACHE', 'LOCAL_CUSTOM_CACHE']),
        }),
      });
    });
  });

  describe('IAM Role Configuration', () => {
    it('should use provided IAM role', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        ServiceRole: Match.stringLikeRegexp('.*kiro-worker-test-codebuild-role.*'),
      });
    });
  });

  describe('Stack Outputs', () => {
    it('should create ProjectName output', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasOutput('ProjectName', {
        Description: 'Name of the CodeBuild project',
        Export: {
          Name: 'TestStack-ProjectName',
        },
      });
    });

    it('should create ProjectArn output', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasOutput('ProjectArn', {
        Description: 'ARN of the CodeBuild project',
        Export: {
          Name: 'TestStack-ProjectArn',
        },
      });
    });

    it('should create BuildRoleArn output', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasOutput('BuildRoleArn', {
        Description: 'ARN of the IAM role used by CodeBuild',
        Export: {
          Name: 'TestStack-BuildRoleArn',
        },
      });
    });
  });

  describe('Resource Tagging', () => {
    it('should tag CodeBuild project with Component tag', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'Component',
            Value: 'CodeBuild',
          }),
        ]),
      });
    });

    it('should tag CodeBuild project with Purpose tag', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'Purpose',
            Value: 'KiroWorker',
          }),
        ]),
      });
    });
  });

  describe('CloudFormation Template Validity', () => {
    it('should create exactly one CodeBuild project', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::CodeBuild::Project', 1);
    });

    it('should not create any IAM roles (uses provided role)', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::IAM::Role', 0);
    });

    it('should synthesize valid CloudFormation template', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);
      const json = template.toJSON();

      expect(json).toBeDefined();
      expect(json.Resources).toBeDefined();
      expect(json.Outputs).toBeDefined();
    });
  });

  describe('Snapshot Tests', () => {
    it('should match snapshot for test environment', () => {
      const stack = new CodeBuildProjectsStack(app, 'TestStack', {
        config: testConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });

    it('should match snapshot for staging environment', () => {
      const stagingConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'staging',
        codeBuildComputeType: 'MEDIUM',
      };

      const stack = new CodeBuildProjectsStack(app, 'StagingStack', {
        config: stagingConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });

    it('should match snapshot for production environment', () => {
      const prodConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'production',
        codeBuildComputeType: 'LARGE',
        codeBuildTimeout: 120,
      };

      const stack = new CodeBuildProjectsStack(app, 'ProdStack', {
        config: prodConfig,
        artifactsBucket: mockArtifactsBucket,
        codeBuildLogGroup: mockLogGroup,
        codeBuildRole: mockRole,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
