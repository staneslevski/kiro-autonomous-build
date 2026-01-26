/**
 * Environment Configuration for Kiro CodeBuild Worker
 * 
 * This module defines environment-specific configurations for test, staging,
 * and production deployments. Each environment has its own AWS account, region,
 * coverage thresholds, and polling intervals.
 */

/**
 * Environment configuration interface defining all environment-specific settings.
 */
export interface EnvironmentConfig {
  /** AWS account ID for this environment */
  account: string;
  
  /** AWS region for deployment */
  region: string;
  
  /** Environment name (test, staging, or production) */
  environment: 'test' | 'staging' | 'production';
  
  /** Optional VPC ID for CodeBuild projects */
  vpcId?: string;
  
  /** Minimum code coverage threshold percentage (0-100) */
  coverageThreshold: number;
  
  /** EventBridge schedule expression for work item polling (e.g., "rate(5 minutes)") */
  pollingInterval: string;
  
  /** CodeBuild compute type (SMALL, MEDIUM, LARGE) */
  codeBuildComputeType?: 'SMALL' | 'MEDIUM' | 'LARGE';
  
  /** CodeBuild timeout in minutes */
  codeBuildTimeout?: number;
  
  /** Lambda function timeout in minutes */
  lambdaTimeout?: number;
  
  /** DynamoDB lock TTL in hours */
  lockTTLHours?: number;
  
  /** S3 artifact retention in days */
  artifactRetentionDays?: number;
  
  /** CloudWatch log retention in days */
  logRetentionDays?: number;
  
  /** Enable detailed CloudWatch metrics */
  enableDetailedMetrics?: boolean;
  
  /** SNS topic email for alerts */
  alertEmail?: string;
}

/**
 * Get environment configurations for test, staging, and production.
 * 
 * Account IDs default to CDK_DEFAULT_ACCOUNT environment variable.
 * Override with specific account IDs for cross-account deployments.
 * 
 * This is a function to allow dynamic reading of environment variables.
 */
function getEnvironments(): Record<string, EnvironmentConfig> {
  const account = process.env.CDK_DEFAULT_ACCOUNT || '';
  
  return {
    test: {
      account,
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
    },
    
    staging: {
      account,
      region: 'us-east-1',
      environment: 'staging',
      coverageThreshold: 80,
      pollingInterval: 'rate(10 minutes)',
      codeBuildComputeType: 'SMALL',
      codeBuildTimeout: 60,
      lambdaTimeout: 15,
      lockTTLHours: 2,
      artifactRetentionDays: 60,
      logRetentionDays: 14,
      enableDetailedMetrics: true,
    },
    
    production: {
      account,
      region: 'us-east-1',
      environment: 'production',
      coverageThreshold: 80,
      pollingInterval: 'rate(15 minutes)',
      codeBuildComputeType: 'SMALL',
      codeBuildTimeout: 60,
      lambdaTimeout: 15,
      lockTTLHours: 2,
      artifactRetentionDays: 90,
      logRetentionDays: 30,
      enableDetailedMetrics: false,
    },
  };
}

/**
 * Environment configurations for test, staging, and production.
 * 
 * Account IDs default to CDK_DEFAULT_ACCOUNT environment variable.
 * Override with specific account IDs for cross-account deployments.
 */
export const ENVIRONMENTS: Record<string, EnvironmentConfig> = getEnvironments();

/**
 * Get environment configuration by name.
 * 
 * @param environmentName - Name of the environment (test, staging, production)
 * @returns Environment configuration
 * @throws Error if environment name is invalid
 */
export function getEnvironmentConfig(environmentName: string): EnvironmentConfig {
  // Get fresh environments to pick up any environment variable changes
  const environments = getEnvironments();
  const config = environments[environmentName];
  
  if (!config) {
    throw new Error(
      `Invalid environment: ${environmentName}. Valid environments: ${Object.keys(environments).join(', ')}`
    );
  }
  
  // Validate account is set
  if (!config.account) {
    throw new Error(
      `AWS account not configured for environment: ${environmentName}. ` +
      'Set CDK_DEFAULT_ACCOUNT environment variable or configure account explicitly.'
    );
  }
  
  return config;
}

/**
 * Validate environment configuration.
 * 
 * @param config - Environment configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateEnvironmentConfig(config: EnvironmentConfig): void {
  // Validate account
  if (!config.account || config.account.trim() === '') {
    throw new Error('AWS account ID is required');
  }
  
  if (!/^\d{12}$/.test(config.account)) {
    throw new Error(`Invalid AWS account ID: ${config.account}. Must be 12 digits.`);
  }
  
  // Validate region
  if (!config.region || config.region.trim() === '') {
    throw new Error('AWS region is required');
  }
  
  // Validate coverage threshold
  if (config.coverageThreshold < 0 || config.coverageThreshold > 100) {
    throw new Error(
      `Invalid coverage threshold: ${config.coverageThreshold}. Must be between 0 and 100.`
    );
  }
  
  // Validate polling interval format
  const validIntervalPattern = /^(rate\(\d+\s+(minute|minutes|hour|hours|day|days)\)|cron\(.+\))$/;
  if (!validIntervalPattern.test(config.pollingInterval)) {
    throw new Error(
      `Invalid polling interval: ${config.pollingInterval}. ` +
      'Must be a valid EventBridge schedule expression (e.g., "rate(5 minutes)" or "cron(0 12 * * ? *)").'
    );
  }
  
  // Validate optional numeric fields
  if (config.codeBuildTimeout !== undefined && config.codeBuildTimeout <= 0) {
    throw new Error(`Invalid CodeBuild timeout: ${config.codeBuildTimeout}. Must be positive.`);
  }
  
  if (config.lambdaTimeout !== undefined && config.lambdaTimeout <= 0) {
    throw new Error(`Invalid Lambda timeout: ${config.lambdaTimeout}. Must be positive.`);
  }
  
  if (config.lockTTLHours !== undefined && config.lockTTLHours <= 0) {
    throw new Error(`Invalid lock TTL: ${config.lockTTLHours}. Must be positive.`);
  }
  
  if (config.artifactRetentionDays !== undefined && config.artifactRetentionDays <= 0) {
    throw new Error(`Invalid artifact retention: ${config.artifactRetentionDays}. Must be positive.`);
  }
  
  if (config.logRetentionDays !== undefined && config.logRetentionDays <= 0) {
    throw new Error(`Invalid log retention: ${config.logRetentionDays}. Must be positive.`);
  }
}

/**
 * Get all available environment names.
 * 
 * @returns Array of environment names
 */
export function getAvailableEnvironments(): string[] {
  return Object.keys(ENVIRONMENTS);
}
