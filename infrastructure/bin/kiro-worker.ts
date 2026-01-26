#!/usr/bin/env node

/**
 * CDK App Entry Point for Kiro CodeBuild Worker
 * 
 * This file instantiates all CDK stacks with environment-specific configuration.
 * It reads the environment context from CDK CLI arguments and creates stacks
 * for the specified environment (test, staging, or production).
 * 
 * Usage:
 *   cdk deploy --all --context environment=test
 *   cdk deploy --all --context environment=staging
 *   cdk deploy --all --context environment=production
 * 
 * Stack Dependencies:
 *   1. CoreInfrastructureStack (S3, DynamoDB, CloudWatch)
 *   2. SecretsConfigurationStack (Secrets Manager, Parameter Store)
 *   3. WorkItemPollerStack (Lambda, EventBridge)
 *   4. CodeBuildProjectsStack (CodeBuild projects)
 *   5. MonitoringAlertingStack (CloudWatch Alarms, SNS)
 */

import * as cdk from 'aws-cdk-lib';
import { getEnvironmentConfig, validateEnvironmentConfig } from '../lib/config/environments';

// Create CDK app
const app = new cdk.App();

// Get environment from context (default to 'test')
const environmentName = app.node.tryGetContext('environment') || 'test';

// Get and validate environment configuration
let config;
try {
  config = getEnvironmentConfig(environmentName);
  validateEnvironmentConfig(config);
} catch (error) {
  console.error(`Error loading environment configuration: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

// Define stack environment (AWS account and region)
const stackEnv: cdk.Environment = {
  account: config.account,
  region: config.region,
};

// Stack naming prefix
const stackPrefix = `KiroWorker-${config.environment}`;

/**
 * TODO: Instantiate stacks here as they are implemented in later tasks
 * 
 * Example stack instantiation (to be uncommented when stacks are created):
 * 
 * // 1. Core Infrastructure Stack
 * const coreStack = new CoreInfrastructureStack(app, `${stackPrefix}-Core`, {
 *   env: stackEnv,
 *   description: `Core infrastructure for Kiro Worker (${config.environment})`,
 *   config,
 * });
 * 
 * // 2. Secrets Configuration Stack
 * const secretsStack = new SecretsConfigurationStack(app, `${stackPrefix}-Secrets`, {
 *   env: stackEnv,
 *   description: `Secrets and configuration for Kiro Worker (${config.environment})`,
 *   config,
 * });
 * 
 * // 3. Work Item Poller Stack
 * const pollerStack = new WorkItemPollerStack(app, `${stackPrefix}-Poller`, {
 *   env: stackEnv,
 *   description: `Work item poller Lambda for Kiro Worker (${config.environment})`,
 *   config,
 *   locksTable: coreStack.locksTable,
 *   githubTokenSecret: secretsStack.githubTokenSecret,
 * });
 * 
 * // 4. CodeBuild Projects Stack
 * const codeBuildStack = new CodeBuildProjectsStack(app, `${stackPrefix}-CodeBuild`, {
 *   env: stackEnv,
 *   description: `CodeBuild projects for Kiro Worker (${config.environment})`,
 *   config,
 *   artifactsBucket: coreStack.artifactsBucket,
 *   logGroup: coreStack.logGroup,
 *   githubTokenSecret: secretsStack.githubTokenSecret,
 *   gitCredentialsSecret: secretsStack.gitCredentialsSecret,
 * });
 * 
 * // 5. Monitoring and Alerting Stack
 * const monitoringStack = new MonitoringAlertingStack(app, `${stackPrefix}-Monitoring`, {
 *   env: stackEnv,
 *   description: `Monitoring and alerting for Kiro Worker (${config.environment})`,
 *   config,
 *   codeBuildProject: codeBuildStack.project,
 *   pollerFunction: pollerStack.pollerFunction,
 *   locksTable: coreStack.locksTable,
 * });
 */

// Add tags to all resources in the app
cdk.Tags.of(app).add('Project', 'KiroWorker');
cdk.Tags.of(app).add('Environment', config.environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');

// Synthesize the app
app.synth();
