/**
 * Type definitions for CD Pipeline deployment tracking and monitoring
 */

/**
 * Environment types for deployment pipeline
 */
export type Environment = 'test' | 'staging' | 'production';

/**
 * Deployment status values
 */
export type DeploymentStatus = 'in_progress' | 'succeeded' | 'failed' | 'rolled_back';

/**
 * Rollback level indicating scope of rollback operation
 */
export type RollbackLevel = 'stage' | 'full';

/**
 * Deployment record stored in DynamoDB
 * Tracks complete deployment lifecycle and metadata
 */
export interface DeploymentRecord {
  /**
   * Unique deployment identifier
   * Format: {environment}#{timestamp}
   */
  deploymentId: string;

  /**
   * Target environment for deployment
   */
  environment: Environment;

  /**
   * Git commit SHA being deployed
   */
  version: string;

  /**
   * Current deployment status
   */
  status: DeploymentStatus;

  /**
   * Deployment start timestamp (Unix milliseconds)
   */
  startTime: number;

  /**
   * Deployment end timestamp (Unix milliseconds)
   * Undefined if deployment is still in progress
   */
  endTime?: number;

  /**
   * Whether infrastructure changes were detected and deployed
   */
  infrastructureChanged: boolean;

  /**
   * Git commit message
   */
  commitMessage: string;

  /**
   * Git commit author email
   */
  commitAuthor: string;

  /**
   * AWS CodePipeline execution ID
   */
  pipelineExecutionId: string;

  /**
   * Whether unit tests passed
   */
  unitTestsPassed: boolean;

  /**
   * Whether integration tests passed
   */
  integrationTestsPassed: boolean;

  /**
   * Whether end-to-end tests passed
   */
  e2eTestsPassed: boolean;

  /**
   * Code coverage percentage (0-100)
   */
  coveragePercentage: number;

  /**
   * Reason for rollback if deployment was rolled back
   */
  rollbackReason?: string;

  /**
   * Level of rollback performed
   */
  rollbackLevel?: RollbackLevel;

  /**
   * Timestamp when rollback was initiated (Unix milliseconds)
   */
  rollbackTime?: number;

  /**
   * S3 location of deployment artifacts
   */
  artifactLocation: string;

  /**
   * TTL for automatic DynamoDB record cleanup (Unix seconds)
   * Set to 90 days from deployment start
   */
  expiresAt: number;
}

/**
 * CloudWatch alarm information
 */
export interface AlarmInfo {
  /**
   * Alarm name
   */
  name: string;

  /**
   * Current alarm state
   */
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';

  /**
   * Reason for current state
   */
  reason?: string;
}

/**
 * Health check monitoring result
 */
export interface HealthCheckResult {
  /**
   * Whether health checks passed
   */
  success: boolean;

  /**
   * List of alarms that failed
   */
  failedAlarms: AlarmInfo[];

  /**
   * Timestamp when health check completed (Unix milliseconds)
   */
  timestamp?: number;
}

/**
 * Test execution results
 */
export interface TestResults {
  /**
   * Whether unit tests passed
   */
  unitTestsPassed: boolean;

  /**
   * Whether integration tests passed
   */
  integrationTestsPassed: boolean;

  /**
   * Whether end-to-end tests passed
   */
  e2eTestsPassed: boolean;

  /**
   * Code coverage percentage (0-100)
   */
  coveragePercentage: number;

  /**
   * Summary of test execution
   */
  testSummary: {
    /**
     * Total number of tests executed
     */
    total: number;

    /**
     * Number of tests that passed
     */
    passed: number;

    /**
     * Number of tests that failed
     */
    failed: number;

    /**
     * Number of tests that were skipped
     */
    skipped: number;
  };

  /**
   * Details of failed tests
   */
  failedTests?: FailedTest[];
}

/**
 * Information about a failed test
 */
export interface FailedTest {
  /**
   * Test name
   */
  name: string;

  /**
   * Test suite name
   */
  suite: string;

  /**
   * Error message
   */
  error: string;

  /**
   * Stack trace if available
   */
  stackTrace?: string;
}

/**
 * Security scan violation
 */
export interface SecurityViolation {
  /**
   * Violation severity level
   */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  /**
   * Description of the security issue
   */
  description: string;

  /**
   * Resource or file where violation was found
   */
  resource?: string;

  /**
   * Rule that was violated
   */
  rule?: string;

  /**
   * Remediation guidance
   */
  remediation?: string;
}
