/**
 * Configuration type definitions for CD Pipeline
 */

import { Duration } from 'aws-cdk-lib';
import { Environment } from './pipeline-types';

/**
 * Complete pipeline configuration
 */
export interface PipelineConfig {
  /**
   * Target environment
   */
  environment: Environment;

  /**
   * AWS account ID
   */
  account: string;

  /**
   * AWS region
   */
  region: string;

  /**
   * GitHub repository owner/organization
   */
  githubOwner: string;

  /**
   * GitHub repository name
   */
  githubRepo: string;

  /**
   * GitHub branch to monitor
   */
  githubBranch: string;

  /**
   * Environment-specific configuration
   */
  environmentConfig: PipelineEnvironmentConfig;

  /**
   * Build configuration
   */
  buildConfig: BuildConfig;

  /**
   * Monitoring configuration
   */
  monitoringConfig: MonitoringConfig;
}

/**
 * Environment-specific pipeline configuration
 */
export interface PipelineEnvironmentConfig {
  /**
   * Whether pipeline is enabled for this environment
   */
  pipelineEnabled: boolean;

  /**
   * Duration to monitor health checks after deployment
   */
  healthCheckDuration: Duration;

  /**
   * CloudWatch alarm name prefixes to monitor
   * Example: ['kiro-worker-test-', 'kiro-pipeline-test-']
   */
  alarmPrefixes: string[];

  /**
   * Whether manual approval is required before deployment
   * Typically true for production, false for test/staging
   */
  requiresApproval: boolean;

  /**
   * Timeout for manual approval (in hours)
   * Default: 24 hours
   */
  approvalTimeout?: number;

  /**
   * Whether to enable parallel test execution
   */
  parallelTests: boolean;

  /**
   * Maximum number of concurrent deployments allowed
   * Default: 1 (sequential deployments)
   */
  maxConcurrentDeployments: number;
}

/**
 * Build and test configuration
 */
export interface BuildConfig {
  /**
   * Node.js runtime version
   * Example: '18'
   */
  nodeVersion: string;

  /**
   * CodeBuild compute type
   * Example: 'SMALL', 'MEDIUM', 'LARGE'
   */
  computeType: string;

  /**
   * Build timeout in minutes
   */
  buildTimeout: number;

  /**
   * Test timeout in minutes
   */
  testTimeout: number;

  /**
   * Minimum code coverage percentage required (0-100)
   */
  coverageThreshold: number;

  /**
   * Whether to enable build caching
   */
  enableCache: boolean;

  /**
   * Cache paths for build optimization
   */
  cachePaths: string[];

  /**
   * Environment variables for build
   */
  environmentVariables: Record<string, string>;

  /**
   * Security scan configuration
   */
  securityScan: {
    /**
     * Whether to run cfn-guard security validation
     */
    enableCfnGuard: boolean;

    /**
     * Whether to run cfn-lint template validation
     */
    enableCfnLint: boolean;

    /**
     * Whether to run npm audit for dependency vulnerabilities
     */
    enableNpmAudit: boolean;

    /**
     * npm audit severity level that blocks deployment
     * Example: 'high' blocks HIGH and CRITICAL
     */
    npmAuditLevel: 'low' | 'moderate' | 'high' | 'critical';
  };
}

/**
 * Monitoring and alerting configuration
 */
export interface MonitoringConfig {
  /**
   * Whether to enable CloudWatch dashboard
   */
  enableDashboard: boolean;

  /**
   * Dashboard refresh interval in seconds
   */
  dashboardRefreshInterval: number;

  /**
   * Alarm configuration
   */
  alarms: {
    /**
     * Pipeline failure threshold (number of failures in evaluation period)
     */
    pipelineFailureThreshold: number;

    /**
     * Pipeline failure evaluation period in minutes
     */
    pipelineFailureEvaluationPeriod: number;

    /**
     * Rollback count threshold (number of rollbacks in evaluation period)
     */
    rollbackThreshold: number;

    /**
     * Rollback evaluation period in minutes
     */
    rollbackEvaluationPeriod: number;

    /**
     * Deployment duration threshold in minutes
     */
    deploymentDurationThreshold: number;

    /**
     * Whether to enable alarm actions (SNS notifications)
     */
    enableAlarmActions: boolean;
  };

  /**
   * Notification configuration
   */
  notifications: {
    /**
     * Email addresses for deployment notifications
     */
    emailAddresses: string[];

    /**
     * Slack webhook URL for notifications (optional)
     */
    slackWebhookUrl?: string;

    /**
     * Whether to send notifications for successful deployments
     */
    notifyOnSuccess: boolean;

    /**
     * Whether to send notifications for failed deployments
     */
    notifyOnFailure: boolean;

    /**
     * Whether to send notifications for rollbacks
     */
    notifyOnRollback: boolean;
  };

  /**
   * Log retention configuration
   */
  logging: {
    /**
     * CloudWatch log retention in days
     */
    retentionDays: number;

    /**
     * Whether to enable log encryption
     */
    enableEncryption: boolean;

    /**
     * Log level for pipeline components
     */
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  };

  /**
   * Metrics configuration
   */
  metrics: {
    /**
     * Custom CloudWatch metrics namespace
     */
    namespace: string;

    /**
     * Metric publishing interval in seconds
     */
    publishInterval: number;

    /**
     * Whether to enable detailed metrics
     */
    enableDetailedMetrics: boolean;
  };
}
