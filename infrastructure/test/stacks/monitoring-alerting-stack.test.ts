/**
 * Tests for MonitoringAlertingStack
 * 
 * Validates:
 * - SNS topic creation with proper configuration
 * - CloudWatch Alarms for build metrics
 * - CloudWatch Alarms for operation metrics
 * - CloudWatch Alarms for resource metrics
 * - Environment-specific alarm thresholds
 * - NotificationInterface abstraction
 * - CloudFormation outputs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { MonitoringAlertingStack } from '../../lib/stacks/monitoring-alerting-stack';
import { EnvironmentConfig } from '../../lib/config/environments';

describe('MonitoringAlertingStack', () => {
  let app: cdk.App;
  let testConfig: EnvironmentConfig;
  let mockCodeBuildProject: codebuild.IProject;
  let mockLambdaFunction: lambda.IFunction;
  let mockDynamoDBTable: dynamodb.ITable;

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

    // Create mock resources
    const mockStack = new cdk.Stack(app, 'MockStack');
    
    mockCodeBuildProject = codebuild.Project.fromProjectName(
      mockStack,
      'MockProject',
      'test-project'
    );
    
    mockLambdaFunction = lambda.Function.fromFunctionName(
      mockStack,
      'MockFunction',
      'test-function'
    );
    
    mockDynamoDBTable = dynamodb.Table.fromTableName(
      mockStack,
      'MockTable',
      'test-table'
    );
  });

  describe('Stack Creation', () => {
    it('should create stack successfully', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      expect(stack).toBeDefined();
      expect(stack.alertTopic).toBeDefined();
      expect(stack.notificationService).toBeDefined();
      expect(stack.alarmThresholds).toBeDefined();
    });

    it('should create stack with alert email', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
        alertEmail: 'alerts@example.com',
      });

      const template = Template.fromStack(stack);
      
      // Verify email subscription exists
      template.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'alerts@example.com',
      });
    });
  });

  describe('SNS Topic Configuration', () => {
    it('should create SNS topic with correct name', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: 'kiro-worker-test-alerts',
        DisplayName: 'Kiro Worker test Alerts',
      });
    });

    it('should create exactly one SNS topic', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::SNS::Topic', 1);
    });

    it('should have proper tags on SNS topic', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::SNS::Topic', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Monitoring' },
          { Key: 'Purpose', Value: 'Alerts' },
        ]),
      });
    });
  });

  describe('Build Metric Alarms', () => {
    it('should create build failure rate warning alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-build-failure-rate-warning',
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 1,
        TreatMissingData: 'notBreaching',
      });
    });

    it('should create build failure rate error alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-build-failure-rate-error',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create build duration warning alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-build-duration-warning',
        ComparisonOperator: 'GreaterThanThreshold',
        EvaluationPeriods: 2,
      });
    });

    it('should create build duration error alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-build-duration-error',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create build success rate alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-build-success-rate-low',
        ComparisonOperator: 'LessThanThreshold',
      });
    });
  });

  describe('Operation Metric Alarms', () => {
    it('should create Lambda error rate warning alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-lambda-error-rate-warning',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create Lambda error rate error alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-lambda-error-rate-error',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create Lambda throttles alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-lambda-throttles',
        Threshold: 1,
      });
    });

    it('should create Lambda duration alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-lambda-duration-high',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create DynamoDB read throttle warning alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-dynamodb-read-throttle-warning',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create DynamoDB read throttle error alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-dynamodb-read-throttle-error',
        ComparisonOperator: 'GreaterThanThreshold',
      });
    });

    it('should create DynamoDB system errors alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-dynamodb-system-errors',
        Threshold: 1,
      });
    });
  });

  describe('Resource Metric Alarms', () => {
    it('should create Lambda concurrent executions alarm', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'kiro-worker-test-lambda-concurrency-high',
        Threshold: 5,
        EvaluationPeriods: 2,
      });
    });
  });

  describe('Alarm Actions', () => {
    it('should configure SNS actions for all alarms', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      // Get all alarms
      const alarms = template.findResources('AWS::CloudWatch::Alarm');
      
      // Verify each alarm has AlarmActions configured
      Object.values(alarms).forEach((alarm: any) => {
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Environment-Specific Thresholds', () => {
    it('should use test environment thresholds', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      expect(stack.alarmThresholds.buildFailureRate.warning).toBe(0.40);
      expect(stack.alarmThresholds.buildFailureRate.error).toBe(0.60);
      expect(stack.alarmThresholds.buildDuration.warning).toBe(40);
      expect(stack.alarmThresholds.buildDuration.error).toBe(50);
    });

    it('should use staging environment thresholds', () => {
      const stagingConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'staging',
      };

      const stack = new MonitoringAlertingStack(app, 'StagingStack', {
        config: stagingConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      expect(stack.alarmThresholds.buildFailureRate.warning).toBe(0.30);
      expect(stack.alarmThresholds.buildFailureRate.error).toBe(0.50);
      expect(stack.alarmThresholds.buildDuration.warning).toBe(35);
      expect(stack.alarmThresholds.buildDuration.error).toBe(45);
    });

    it('should use production environment thresholds', () => {
      const prodConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'production',
      };

      const stack = new MonitoringAlertingStack(app, 'ProdStack', {
        config: prodConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      expect(stack.alarmThresholds.buildFailureRate.warning).toBe(0.25);
      expect(stack.alarmThresholds.buildFailureRate.error).toBe(0.50);
      expect(stack.alarmThresholds.buildDuration.warning).toBe(30);
      expect(stack.alarmThresholds.buildDuration.error).toBe(45);
    });

    it('should have stricter thresholds for production than test', () => {
      const testStack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const prodConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'production',
      };

      const prodStack = new MonitoringAlertingStack(app, 'ProdStack', {
        config: prodConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      // Production should have stricter (lower) warning thresholds
      expect(prodStack.alarmThresholds.buildFailureRate.warning)
        .toBeLessThan(testStack.alarmThresholds.buildFailureRate.warning);
      expect(prodStack.alarmThresholds.buildDuration.warning)
        .toBeLessThan(testStack.alarmThresholds.buildDuration.warning);
    });
  });

  describe('NotificationInterface', () => {
    it('should create notification service', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      expect(stack.notificationService).toBeDefined();
      expect(stack.notificationService.getTopicArn()).toBe(stack.alertTopic.topicArn);
    });

    it('should provide topic ARN through interface', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const topicArn = stack.notificationService.getTopicArn();
      // Topic ARN is a CDK token at synthesis time, just verify it's defined
      expect(topicArn).toBeDefined();
      expect(topicArn).toBe(stack.alertTopic.topicArn);
    });
  });

  describe('CloudFormation Outputs', () => {
    it('should create alert topic ARN output', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasOutput('AlertTopicArn', {
        Description: 'ARN of the SNS topic for alert notifications',
        Export: {
          Name: 'TestStack-AlertTopicArn',
        },
      });
    });

    it('should create alert topic name output', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasOutput('AlertTopicName', {
        Description: 'Name of the SNS topic for alert notifications',
      });
    });

    it('should create threshold outputs', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      template.hasOutput('BuildFailureRateWarningThreshold', {
        Description: 'Build failure rate warning threshold percentage',
      });

      template.hasOutput('BuildFailureRateErrorThreshold', {
        Description: 'Build failure rate error threshold percentage',
      });

      template.hasOutput('BuildDurationWarningThreshold', {
        Description: 'Build duration warning threshold in minutes',
      });

      template.hasOutput('BuildDurationErrorThreshold', {
        Description: 'Build duration error threshold in minutes',
      });
    });
  });

  describe('Alarm Count', () => {
    it('should create expected number of alarms', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      
      // Count alarms:
      // Build metrics: 5 (failure warning, failure error, duration warning, duration error, success rate)
      // Operation metrics: 7 (lambda error warning, lambda error error, lambda throttles, lambda duration, dynamo throttle warning, dynamo throttle error, dynamo system errors)
      // Resource metrics: 1 (lambda concurrency)
      // Total: 13 alarms
      template.resourceCountIs('AWS::CloudWatch::Alarm', 13);
    });
  });

  describe('Snapshot Tests', () => {
    it('should match snapshot for test environment', () => {
      const stack = new MonitoringAlertingStack(app, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });

    it('should match snapshot for production environment', () => {
      const prodConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'production',
      };

      const stack = new MonitoringAlertingStack(app, 'ProdStack', {
        config: prodConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
