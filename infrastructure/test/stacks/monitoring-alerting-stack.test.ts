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
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::SNS::Topic', 1);
    });

    it('should have proper tags on SNS topic', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const testStack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });

      expect(stack.notificationService).toBeDefined();
      expect(stack.notificationService.getTopicArn()).toBe(stack.alertTopic.topicArn);
    });

    it('should provide topic ARN through interface', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
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
  
  describe('CD Pipeline Monitoring', () => {
    let mockPipeline: codepipeline.IPipeline;
    let mockDeploymentsTable: dynamodb.ITable;
    
    beforeEach(() => {
      const mockStack = new cdk.Stack(app, 'MockPipelineStack');
      
      // Create a real pipeline for testing (minimal configuration with 2 stages)
      const sourceOutput = new codepipeline.Artifact();
      
      mockPipeline = new codepipeline.Pipeline(mockStack, 'MockPipeline', {
        pipelineName: 'test-pipeline',
        stages: [
          {
            stageName: 'Source',
            actions: [
              new codepipeline_actions.GitHubSourceAction({
                actionName: 'GitHub',
                owner: 'test-owner',
                repo: 'test-repo',
                oauthToken: cdk.SecretValue.unsafePlainText('test-token'),
                output: sourceOutput,
              }),
            ],
          },
          {
            stageName: 'Build',
            actions: [
              new codepipeline_actions.ManualApprovalAction({
                actionName: 'Approve',
              }),
            ],
          },
        ],
      });
      
      mockDeploymentsTable = dynamodb.Table.fromTableName(
        mockStack,
        'MockDeploymentsTable',
        'test-deployments-table'
      );
    });
    
    describe('SNS Topics', () => {
      it('should create all 3 new SNS topics with correct names', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        const template = Template.fromStack(stack);
        
        // Should have 4 SNS topics total (1 alert + 3 CD pipeline)
        template.resourceCountIs('AWS::SNS::Topic', 4);
        
        // Verify deployment notifications topic
        template.hasResourceProperties('AWS::SNS::Topic', {
          TopicName: 'kiro-pipeline-test-deployment-notifications',
          DisplayName: 'Kiro Pipeline test Deployment Notifications',
        });
        
        // Verify approval requests topic
        template.hasResourceProperties('AWS::SNS::Topic', {
          TopicName: 'kiro-pipeline-test-approval-requests',
          DisplayName: 'Kiro Pipeline test Approval Requests',
        });
        
        // Verify rollback notifications topic
        template.hasResourceProperties('AWS::SNS::Topic', {
          TopicName: 'kiro-pipeline-test-rollback-notifications',
          DisplayName: 'Kiro Pipeline test Rollback Notifications',
        });
      });
      
      it('should have email subscriptions configured when alertEmail provided', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
          alertEmail: 'alerts@example.com',
        });

        const template = Template.fromStack(stack);
        
        // Should have 4 email subscriptions (1 alert + 3 CD pipeline)
        template.resourceCountIs('AWS::SNS::Subscription', 4);
        
        // All should be email subscriptions to the same address
        template.hasResourceProperties('AWS::SNS::Subscription', {
          Protocol: 'email',
          Endpoint: 'alerts@example.com',
        });
      });
      
      it('should expose SNS topics as public properties', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        expect(stack.deploymentNotificationsTopic).toBeDefined();
        expect(stack.approvalRequestsTopic).toBeDefined();
        expect(stack.rollbackNotificationsTopic).toBeDefined();
      });
    });
    
    describe('CloudWatch Alarms', () => {
      it('should create CloudWatch alarms with correct thresholds', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        const template = Template.fromStack(stack);
        
        // Should have 16 alarms total (13 existing + 3 CD pipeline)
        template.resourceCountIs('AWS::CloudWatch::Alarm', 16);
        
        // Pipeline failure alarm (3 failures in 1 hour)
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: 'kiro-pipeline-test-failures',
          AlarmDescription: 'Alert when pipeline fails 3 or more times in 1 hour',
          Threshold: 3,
          ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        });
        
        // Rollback alarm (2 rollbacks in 1 hour)
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: 'kiro-pipeline-test-rollbacks',
          AlarmDescription: 'Alert when 2 or more rollbacks occur in 1 hour',
          Threshold: 2,
          ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        });
        
        // Deployment duration alarm (> 60 minutes = 3600 seconds)
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: 'kiro-pipeline-test-deployment-duration',
          AlarmDescription: 'Alert when deployment takes longer than 60 minutes',
          Threshold: 3600,
          ComparisonOperator: 'GreaterThanThreshold',
        });
      });
      
      it('should have SNS actions configured for alarms', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        const template = Template.fromStack(stack);
        
        // Pipeline failure alarm should send to alert topic
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: 'kiro-pipeline-test-failures',
          AlarmActions: Match.arrayWith([
            Match.objectLike({
              Ref: Match.stringLikeRegexp('AlertTopic'),
            }),
          ]),
        });
        
        // Rollback alarm should send to rollback notifications topic
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: 'kiro-pipeline-test-rollbacks',
          AlarmActions: Match.arrayWith([
            Match.objectLike({
              Ref: Match.stringLikeRegexp('RollbackNotificationsTopic'),
            }),
          ]),
        });
        
        // Deployment duration alarm should send to deployment notifications topic
        template.hasResourceProperties('AWS::CloudWatch::Alarm', {
          AlarmName: 'kiro-pipeline-test-deployment-duration',
          AlarmActions: Match.arrayWith([
            Match.objectLike({
              Ref: Match.stringLikeRegexp('DeploymentNotificationsTopic'),
            }),
          ]),
        });
      });
    });
    
    describe('CloudWatch Dashboard', () => {
      it('should create dashboard with pipeline metrics widgets', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        const template = Template.fromStack(stack);
        
        // Should create dashboard
        template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
          DashboardName: 'kiro-pipeline-test-dashboard',
        });
        
        // Dashboard should have widgets (verified by checking DashboardBody exists)
        template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
          DashboardBody: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp('Pipeline Executions'),
              ]),
            ]),
          }),
        });
      });
      
      it('should expose dashboard as public property', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        expect(stack.pipelineDashboard).toBeDefined();
      });
    });
    
    describe('CloudFormation Outputs', () => {
      it('should export topic ARNs for CD pipeline topics', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        const template = Template.fromStack(stack);
        
        // Verify deployment notifications topic ARN output
        template.hasOutput('DeploymentNotificationsTopicArn', {
          Description: 'ARN of the SNS topic for deployment notifications',
          Export: {
            Name: 'TestStack-DeploymentNotificationsTopicArn',
          },
        });
        
        // Verify approval requests topic ARN output
        template.hasOutput('ApprovalRequestsTopicArn', {
          Description: 'ARN of the SNS topic for approval requests',
          Export: {
            Name: 'TestStack-ApprovalRequestsTopicArn',
          },
        });
        
        // Verify rollback notifications topic ARN output
        template.hasOutput('RollbackNotificationsTopicArn', {
          Description: 'ARN of the SNS topic for rollback notifications',
          Export: {
            Name: 'TestStack-RollbackNotificationsTopicArn',
          },
        });
        
        // Verify dashboard name output
        template.hasOutput('PipelineDashboardName', {
          Description: 'Name of the CloudWatch dashboard for pipeline metrics',
        });
      });
    });
    
    describe('Snapshot with CD Pipeline', () => {
      it('should match snapshot with CD pipeline monitoring', () => {
        const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
          config: testConfig,
          codeBuildProject: mockCodeBuildProject,
          lambdaFunction: mockLambdaFunction,
          dynamoDBTable: mockDynamoDBTable,
          cdPipeline: mockPipeline,
          deploymentsTable: mockDeploymentsTable,
        });

        const template = Template.fromStack(stack);
        expect(template.toJSON()).toMatchSnapshot();
      });
    });
  });
});

  describe('Rollback Lambda and EventBridge Integration', () => {
    let mockPipeline: codepipeline.IPipeline;
    let mockDeploymentsTable: dynamodb.ITable;
    let testApp: cdk.App;
    let localTestConfig: EnvironmentConfig;
    let localMockCodeBuildProject: codebuild.IProject;
    let localMockLambdaFunction: lambda.IFunction;
    let localMockDynamoDBTable: dynamodb.ITable;
    
    beforeEach(() => {
      testApp = new cdk.App();
      
      localTestConfig = {
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
      
      const mockStack = new cdk.Stack(testApp, 'MockPipelineStack');
      
      localMockCodeBuildProject = codebuild.Project.fromProjectName(
        mockStack,
        'MockProject',
        'test-project'
      );
      
      localMockLambdaFunction = lambda.Function.fromFunctionName(
        mockStack,
        'MockFunction',
        'test-function'
      );
      
      localMockDynamoDBTable = dynamodb.Table.fromTableName(
        mockStack,
        'MockTable',
        'test-table'
      );
      
      // Create mock pipeline
      const sourceOutput = new codepipeline.Artifact();
      mockPipeline = new codepipeline.Pipeline(mockStack, 'MockPipeline', {
        pipelineName: 'test-pipeline',
        stages: [
          {
            stageName: 'Source',
            actions: [
              new codepipeline_actions.GitHubSourceAction({
                actionName: 'GitHub_Source',
                owner: 'test-owner',
                repo: 'test-repo',
                oauthToken: cdk.SecretValue.unsafePlainText('test-token'),
                output: sourceOutput,
              }),
            ],
          },
        ],
      });
      
      // Create mock deployments table
      mockDeploymentsTable = new dynamodb.Table(mockStack, 'MockDeploymentsTable', {
        partitionKey: { name: 'deploymentId', type: dynamodb.AttributeType.STRING },
      });
    });
    
    it('should create rollback Lambda function with correct configuration', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: localTestConfig,
        codeBuildProject: localMockCodeBuildProject,
        lambdaFunction: localMockLambdaFunction,
        dynamoDBTable: localMockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify Lambda function created
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'kiro-pipeline-test-rollback',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 900, // 15 minutes in seconds
        MemorySize: 512,
        Environment: {
          Variables: {
            TABLE_NAME: Match.anyValue(),
            TOPIC_ARN: Match.anyValue(),
            ARTIFACTS_BUCKET: 'kiro-pipeline-test-artifacts',
            ENVIRONMENT_PREFIXES: 'kiro-worker-test,kiro-pipeline-test',
          },
        },
      });
    });
    
    it('should create Dead Letter Queue for rollback Lambda', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: localTestConfig,
        codeBuildProject: localMockCodeBuildProject,
        lambdaFunction: localMockLambdaFunction,
        dynamoDBTable: localMockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify DLQ created
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'kiro-pipeline-test-rollback-dlq',
        MessageRetentionPeriod: 1209600, // 14 days in seconds
      });
    });
    
    it('should configure Lambda with Dead Letter Queue', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: localTestConfig,
        codeBuildProject: localMockCodeBuildProject,
        lambdaFunction: localMockLambdaFunction,
        dynamoDBTable: localMockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify Lambda has DLQ configured
      template.hasResourceProperties('AWS::Lambda::Function', {
        DeadLetterConfig: {
          TargetArn: Match.anyValue(),
        },
      });
    });
    
    it('should grant Lambda permissions to read from deployments table', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: localTestConfig,
        codeBuildProject: localMockCodeBuildProject,
        lambdaFunction: localMockLambdaFunction,
        dynamoDBTable: localMockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify IAM policy for DynamoDB read access
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'dynamodb:BatchGetItem',
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:Query',
                'dynamodb:GetItem',
                'dynamodb:Scan',
                'dynamodb:ConditionCheckItem',
                'dynamodb:DescribeTable',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
    
    it('should grant Lambda permissions for CodePipeline operations', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: localTestConfig,
        codeBuildProject: localMockCodeBuildProject,
        lambdaFunction: localMockLambdaFunction,
        dynamoDBTable: localMockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify IAM policy for CodePipeline access
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: [
                'codepipeline:GetPipelineState',
                'codepipeline:GetPipelineExecution',
                'codepipeline:StopPipelineExecution',
              ],
              Effect: 'Allow',
              Resource: Match.stringLikeRegexp('.*kiro-pipeline-test'),
            }),
          ]),
        },
      });
    });
    
    it('should grant Lambda permissions for S3 artifacts access', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify IAM policy for S3 access
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: [
                's3:GetObject',
                's3:ListBucket',
              ],
              Effect: 'Allow',
              Resource: Match.arrayWith([
                Match.stringLikeRegexp('.*kiro-pipeline-test-artifacts'),
              ]),
            }),
          ]),
        },
      });
    });
    
    it('should grant Lambda permissions for CloudWatch alarms', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify IAM policy for CloudWatch access
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: [
                'cloudwatch:DescribeAlarms',
                'cloudwatch:GetMetricStatistics',
              ],
              Effect: 'Allow',
              Resource: '*',
            }),
          ]),
        },
      });
    });
    
    it('should create EventBridge rule for CD pipeline alarms', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify EventBridge rule created
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'kiro-pipeline-test-alarm-rollback',
        Description: Match.stringLikeRegexp('.*rollback.*'),
        EventPattern: {
          source: ['aws.cloudwatch'],
          'detail-type': ['CloudWatch Alarm State Change'],
          detail: {
            alarmName: [
              { prefix: 'kiro-worker-test' },
              { prefix: 'kiro-pipeline-test' },
            ],
            state: {
              value: ['ALARM'],
            },
          },
        },
        State: 'ENABLED',
      });
    });
    
    it('should add rollback Lambda as EventBridge rule target', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify EventBridge rule has Lambda target
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
            RetryPolicy: {
              MaximumRetryAttempts: 0,
            },
          }),
        ]),
      });
    });
    
    it('should export rollback Lambda ARN and name', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
        cdPipeline: mockPipeline,
        deploymentsTable: mockDeploymentsTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify outputs exist
      template.hasOutput('RollbackLambdaArn', {
        Description: 'ARN of the rollback Lambda function',
        Export: {
          Name: Match.stringLikeRegexp('.*RollbackLambdaArn'),
        },
      });
      
      template.hasOutput('RollbackLambdaName', {
        Description: 'Name of the rollback Lambda function',
      });
    });
    
    it('should not create rollback Lambda when CD pipeline is not provided', () => {
      const stack = new MonitoringAlertingStack(testApp, 'TestStack', {
        config: testConfig,
        codeBuildProject: mockCodeBuildProject,
        lambdaFunction: mockLambdaFunction,
        dynamoDBTable: mockDynamoDBTable,
      });
      
      const template = Template.fromStack(stack);
      
      // Verify rollback Lambda not created
      expect(stack.rollbackLambda).toBeUndefined();
      
      // Verify no Lambda function with rollback name
      const lambdaFunctions = template.findResources('AWS::Lambda::Function', {
        Properties: {
          FunctionName: 'kiro-pipeline-test-rollback',
        },
      });
      
      expect(Object.keys(lambdaFunctions).length).toBe(0);
    });
  });
