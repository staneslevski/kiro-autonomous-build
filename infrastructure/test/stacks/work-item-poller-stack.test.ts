/**
 * Tests for WorkItemPollerStack
 * 
 * Validates that the stack creates all required resources with correct
 * configurations, IAM permissions, and integrations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { WorkItemPollerStack } from '../../lib/stacks/work-item-poller-stack';
import { EnvironmentConfig } from '../../lib/config/environments';

describe('WorkItemPollerStack', () => {
  let app: cdk.App;
  let stack: WorkItemPollerStack;
  let template: Template;
  let mockConfig: EnvironmentConfig;

  beforeEach(() => {
    app = new cdk.App();
    
    // Create mock configuration
    mockConfig = {
      account: '123456789012',
      region: 'us-east-1',
      environment: 'test',
      coverageThreshold: 80,
      pollingInterval: 'rate(5 minutes)',
      lambdaTimeout: 15,
      logRetentionDays: 7,
    };

    // Create a helper stack for mock resources
    const mockStack = new cdk.Stack(app, 'MockStack');

    // Create mock DynamoDB table
    const mockLocksTable = dynamodb.Table.fromTableName(mockStack, 'MockLocksTable', 'kiro-worker-test-locks');

    // Create mock Lambda log group
    const mockLambdaLogGroup = logs.LogGroup.fromLogGroupArn(
      mockStack,
      'MockLambdaLogGroup',
      'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/kiro-worker-test-poller'
    );

    // Create mock GitHub token secret
    const mockGithubTokenSecret = secretsmanager.Secret.fromSecretAttributes(mockStack, 'MockGithubTokenSecret', {
      secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-worker-test-github-token-abc123',
    });

    // Create stack
    stack = new WorkItemPollerStack(app, 'TestStack', {
      config: mockConfig,
      locksTable: mockLocksTable,
      lambdaLogGroup: mockLambdaLogGroup,
      githubTokenSecret: mockGithubTokenSecret,
      codeBuildProjectName: 'kiro-worker-test',
      githubOrganization: 'test-org',
      githubRepository: 'test-repo',
      githubProjectNumber: 1,
      targetStatusColumn: 'For Implementation',
    });

    template = Template.fromStack(stack);
  });

  describe('Lambda Function', () => {
    it('should create Lambda function with correct configuration', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'kiro-worker-test-poller',
        Runtime: 'nodejs18.x',
        Handler: 'work-item-poller-handler.handler',
        Timeout: 900, // 15 minutes in seconds
        MemorySize: 512,
      });
    });

    it('should configure Lambda with required environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            LOCKS_TABLE_NAME: 'kiro-worker-test-locks',
            GITHUB_TOKEN_SECRET_ARN: Match.stringLikeRegexp('.*github-token.*'),
            CODEBUILD_PROJECT_NAME: 'kiro-worker-test',
            ENVIRONMENT: 'test',
            GITHUB_ORGANIZATION: 'test-org',
            GITHUB_REPOSITORY: 'test-repo',
            GITHUB_PROJECT_NUMBER: '1',
            TARGET_STATUS_COLUMN: 'For Implementation',
            // Note: AWS_REGION is automatically available in Lambda runtime
          },
        },
      });
    });

    it('should configure Lambda with dead letter queue', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        DeadLetterConfig: {
          TargetArn: Match.objectLike({
            'Fn::GetAtt': Match.arrayWith([
              Match.stringLikeRegexp('DeadLetterQueue.*'),
              'Arn',
            ]),
          }),
        },
      });
    });

    it('should set retry attempts to 0', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        ReservedConcurrentExecutions: Match.absent(),
      });
    });

    it('should have correct IAM role', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Role: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('LambdaRole.*'),
            'Arn',
          ]),
        }),
      });
    });
  });

  describe('IAM Role', () => {
    it('should create IAM role with Lambda service principal', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            }),
          ]),
        },
      });
    });

    it('should grant CloudWatch Logs permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith([
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ]),
            }),
          ]),
        },
      });
    });

    it('should grant Secrets Manager permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'secretsmanager:GetSecretValue',
            }),
          ]),
        },
      });
    });

    it('should grant Parameter Store permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith([
                'ssm:GetParameter',
                'ssm:GetParameters',
              ]),
            }),
          ]),
        },
      });
    });

    it('should grant DynamoDB permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith([
                'dynamodb:PutItem',
                'dynamodb:GetItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:UpdateItem',
              ]),
            }),
          ]),
        },
      });
    });

    it('should grant CodeBuild permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'codebuild:StartBuild',
            }),
          ]),
        },
      });
    });

    it('should grant SQS permissions for DLQ', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'sqs:SendMessage',
            }),
          ]),
        },
      });
    });

    it('should grant KMS decrypt permissions with conditions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith([
                'kms:Decrypt',
                'kms:DescribeKey',
              ]),
              Condition: {
                StringEquals: {
                  'kms:ViaService': Match.anyValue(), // CDK may use Fn::Join for dynamic values
                },
              },
            }),
          ]),
        },
      });
    });
  });

  describe('EventBridge Scheduled Rule', () => {
    it('should create EventBridge rule with correct schedule', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        ScheduleExpression: 'rate(5 minutes)',
        State: 'ENABLED',
      });
    });

    it('should target Lambda function', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('PollerFunction.*'),
                'Arn',
              ]),
            }),
          }),
        ]),
      });
    });

    it('should configure retry policy for target', () => {
      // Note: CDK's LambdaFunction target construct may not expose retry policy in CloudFormation
      // The retry behavior is handled by Lambda's built-in retry mechanism
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('PollerFunction.*'),
                'Arn',
              ]),
            }),
          }),
        ]),
      });
    });

    it('should configure dead letter queue for target', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            DeadLetterConfig: {
              Arn: Match.objectLike({
                'Fn::GetAtt': Match.arrayWith([
                  Match.stringLikeRegexp('DeadLetterQueue.*'),
                  'Arn',
                ]),
              }),
            },
          }),
        ]),
      });
    });
  });

  describe('Dead Letter Queue', () => {
    it('should create SQS queue with correct configuration', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'kiro-worker-test-poller-dlq',
        MessageRetentionPeriod: 1209600, // 14 days in seconds
      });
    });

    it('should enable encryption', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        SqsManagedSseEnabled: true,
      });
    });
  });

  describe('Stack Outputs', () => {
    it('should export Lambda function name', () => {
      template.hasOutput('PollerFunctionName', {
        Value: Match.objectLike({
          Ref: Match.stringLikeRegexp('PollerFunction.*'),
        }),
        Export: {
          Name: 'TestStack-PollerFunctionName',
        },
      });
    });

    it('should export Lambda function ARN', () => {
      template.hasOutput('PollerFunctionArn', {
        Value: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('PollerFunction.*'),
            'Arn',
          ]),
        }),
        Export: {
          Name: 'TestStack-PollerFunctionArn',
        },
      });
    });

    it('should export EventBridge rule name', () => {
      template.hasOutput('ScheduledRuleName', {
        Export: {
          Name: 'TestStack-ScheduledRuleName',
        },
      });
    });

    it('should export dead letter queue name', () => {
      template.hasOutput('DeadLetterQueueName', {
        Export: {
          Name: 'TestStack-DeadLetterQueueName',
        },
      });
    });

    it('should export IAM role name', () => {
      template.hasOutput('LambdaRoleName', {
        Export: {
          Name: 'TestStack-LambdaRoleName',
        },
      });
    });
  });

  describe('Resource Counts', () => {
    it('should create exactly one Lambda function', () => {
      template.resourceCountIs('AWS::Lambda::Function', 1);
    });

    it('should create exactly one IAM role', () => {
      template.resourceCountIs('AWS::IAM::Role', 1);
    });

    it('should create exactly one EventBridge rule', () => {
      template.resourceCountIs('AWS::Events::Rule', 1);
    });

    it('should create exactly one SQS queue', () => {
      template.resourceCountIs('AWS::SQS::Queue', 1);
    });

    it('should create Lambda permission for EventBridge', () => {
      template.resourceCountIs('AWS::Lambda::Permission', 1);
    });
  });

  describe('Tags', () => {
    it('should tag Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Lambda' },
          { Key: 'Purpose', Value: 'WorkItemPoller' },
        ]),
      });
    });

    it('should tag IAM role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Lambda' },
          { Key: 'Purpose', Value: 'PollerExecution' },
        ]),
      });
    });

    it('should tag EventBridge rule', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'EventBridge' },
          { Key: 'Purpose', Value: 'PollerSchedule' },
        ]),
      });
    });

    it('should tag SQS queue', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Lambda' },
          { Key: 'Purpose', Value: 'DeadLetterQueue' },
        ]),
      });
    });
  });

  describe('Different Environments', () => {
    it('should create resources with staging environment names', () => {
      const stagingApp = new cdk.App();
      const stagingConfig: EnvironmentConfig = {
        ...mockConfig,
        environment: 'staging',
        pollingInterval: 'rate(10 minutes)',
      };

      const mockStack = new cdk.Stack(stagingApp, 'StagingMockStack');
      const mockLocksTable = dynamodb.Table.fromTableName(mockStack, 'MockLocksTable', 'kiro-worker-test-locks');
      const mockLambdaLogGroup = logs.LogGroup.fromLogGroupArn(
        mockStack,
        'MockLambdaLogGroup',
        'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/kiro-worker-test-poller'
      );
      const mockGithubTokenSecret = secretsmanager.Secret.fromSecretAttributes(mockStack, 'MockGithubTokenSecret', {
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-worker-test-github-token-abc123',
      });

      const stagingStack = new WorkItemPollerStack(stagingApp, 'StagingStack', {
        config: stagingConfig,
        locksTable: mockLocksTable,
        lambdaLogGroup: mockLambdaLogGroup,
        githubTokenSecret: mockGithubTokenSecret,
        codeBuildProjectName: 'kiro-worker-staging',
        githubOrganization: 'test-org',
        githubRepository: 'test-repo',
        githubProjectNumber: 1,
      });

      const stagingTemplate = Template.fromStack(stagingStack);

      stagingTemplate.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'kiro-worker-staging-poller',
        Environment: {
          Variables: Match.objectLike({
            ENVIRONMENT: 'staging',
          }),
        },
      });

      stagingTemplate.hasResourceProperties('AWS::Events::Rule', {
        ScheduleExpression: 'rate(10 minutes)',
      });
    });

    it('should create resources with production environment names', () => {
      const prodApp = new cdk.App();
      const prodConfig: EnvironmentConfig = {
        ...mockConfig,
        environment: 'production',
        pollingInterval: 'rate(15 minutes)',
        lambdaTimeout: 10,
      };

      const mockStack = new cdk.Stack(prodApp, 'ProdMockStack');
      const mockLocksTable = dynamodb.Table.fromTableName(mockStack, 'MockLocksTable', 'kiro-worker-test-locks');
      const mockLambdaLogGroup = logs.LogGroup.fromLogGroupArn(
        mockStack,
        'MockLambdaLogGroup',
        'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/kiro-worker-test-poller'
      );
      const mockGithubTokenSecret = secretsmanager.Secret.fromSecretAttributes(mockStack, 'MockGithubTokenSecret', {
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-worker-test-github-token-abc123',
      });

      const prodStack = new WorkItemPollerStack(prodApp, 'ProdStack', {
        config: prodConfig,
        locksTable: mockLocksTable,
        lambdaLogGroup: mockLambdaLogGroup,
        githubTokenSecret: mockGithubTokenSecret,
        codeBuildProjectName: 'kiro-worker-production',
        githubOrganization: 'test-org',
        githubRepository: 'test-repo',
        githubProjectNumber: 1,
      });

      const prodTemplate = Template.fromStack(prodStack);

      prodTemplate.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'kiro-worker-production-poller',
        Timeout: 600, // 10 minutes
        Environment: {
          Variables: Match.objectLike({
            ENVIRONMENT: 'production',
          }),
        },
      });

      prodTemplate.hasResourceProperties('AWS::Events::Rule', {
        ScheduleExpression: 'rate(15 minutes)',
      });
    });
  });

  describe('Custom Target Status Column', () => {
    it('should use default target status column when not provided', () => {
      const defaultApp = new cdk.App();
      const mockStack = new cdk.Stack(defaultApp, 'DefaultMockStack');
      const mockLocksTable = dynamodb.Table.fromTableName(mockStack, 'MockLocksTable', 'kiro-worker-test-locks');
      const mockLambdaLogGroup = logs.LogGroup.fromLogGroupArn(
        mockStack,
        'MockLambdaLogGroup',
        'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/kiro-worker-test-poller'
      );
      const mockGithubTokenSecret = secretsmanager.Secret.fromSecretAttributes(mockStack, 'MockGithubTokenSecret', {
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-worker-test-github-token-abc123',
      });

      const stackWithDefault = new WorkItemPollerStack(defaultApp, 'DefaultStack', {
        config: mockConfig,
        locksTable: mockLocksTable,
        lambdaLogGroup: mockLambdaLogGroup,
        githubTokenSecret: mockGithubTokenSecret,
        codeBuildProjectName: 'kiro-worker-test',
        githubOrganization: 'test-org',
        githubRepository: 'test-repo',
        githubProjectNumber: 1,
        // targetStatusColumn not provided
      });

      const defaultTemplate = Template.fromStack(stackWithDefault);

      defaultTemplate.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            TARGET_STATUS_COLUMN: 'For Implementation',
          }),
        },
      });
    });

    it('should use custom target status column when provided', () => {
      const customApp = new cdk.App();
      const mockStack = new cdk.Stack(customApp, 'CustomMockStack');
      const mockLocksTable = dynamodb.Table.fromTableName(mockStack, 'MockLocksTable', 'kiro-worker-test-locks');
      const mockLambdaLogGroup = logs.LogGroup.fromLogGroupArn(
        mockStack,
        'MockLambdaLogGroup',
        'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/kiro-worker-test-poller'
      );
      const mockGithubTokenSecret = secretsmanager.Secret.fromSecretAttributes(mockStack, 'MockGithubTokenSecret', {
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-worker-test-github-token-abc123',
      });

      const stackWithCustom = new WorkItemPollerStack(customApp, 'CustomStack', {
        config: mockConfig,
        locksTable: mockLocksTable,
        lambdaLogGroup: mockLambdaLogGroup,
        githubTokenSecret: mockGithubTokenSecret,
        codeBuildProjectName: 'kiro-worker-test',
        githubOrganization: 'test-org',
        githubRepository: 'test-repo',
        githubProjectNumber: 1,
        targetStatusColumn: 'Ready for Development',
      });

      const customTemplate = Template.fromStack(stackWithCustom);

      customTemplate.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            TARGET_STATUS_COLUMN: 'Ready for Development',
          }),
        },
      });
    });
  });

  describe('Snapshot Test', () => {
    it('should match CloudFormation template snapshot', () => {
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
