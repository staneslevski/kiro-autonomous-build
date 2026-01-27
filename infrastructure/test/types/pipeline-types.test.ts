import { describe, it, expect } from 'vitest';
import type {
  Environment,
  DeploymentStatus,
  RollbackLevel,
  DeploymentRecord,
  AlarmInfo,
  HealthCheckResult,
  TestResults,
  FailedTest,
  SecurityViolation
} from '../../lib/types/pipeline-types';

describe('Pipeline Types', () => {
  describe('Environment Type', () => {
    it('should accept valid environment values', () => {
      const testEnv: Environment = 'test';
      const stagingEnv: Environment = 'staging';
      const prodEnv: Environment = 'production';

      expect(testEnv).toBe('test');
      expect(stagingEnv).toBe('staging');
      expect(prodEnv).toBe('production');
    });

    it('should be one of three valid values', () => {
      const validEnvironments: Environment[] = ['test', 'staging', 'production'];
      expect(validEnvironments).toHaveLength(3);
      expect(validEnvironments).toContain('test');
      expect(validEnvironments).toContain('staging');
      expect(validEnvironments).toContain('production');
    });
  });

  describe('DeploymentStatus Type', () => {
    it('should accept valid deployment status values', () => {
      const inProgress: DeploymentStatus = 'in_progress';
      const succeeded: DeploymentStatus = 'succeeded';
      const failed: DeploymentStatus = 'failed';
      const rolledBack: DeploymentStatus = 'rolled_back';

      expect(inProgress).toBe('in_progress');
      expect(succeeded).toBe('succeeded');
      expect(failed).toBe('failed');
      expect(rolledBack).toBe('rolled_back');
    });

    it('should be one of four valid values', () => {
      const validStatuses: DeploymentStatus[] = [
        'in_progress',
        'succeeded',
        'failed',
        'rolled_back'
      ];
      expect(validStatuses).toHaveLength(4);
    });
  });

  describe('RollbackLevel Type', () => {
    it('should accept valid rollback level values', () => {
      const stage: RollbackLevel = 'stage';
      const full: RollbackLevel = 'full';

      expect(stage).toBe('stage');
      expect(full).toBe('full');
    });

    it('should be one of two valid values', () => {
      const validLevels: RollbackLevel[] = ['stage', 'full'];
      expect(validLevels).toHaveLength(2);
    });
  });

  describe('DeploymentRecord Interface', () => {
    it('should create a valid deployment record with all required fields', () => {
      const record: DeploymentRecord = {
        deploymentId: 'test#1706356800000',
        environment: 'test',
        version: 'abc123def456',
        status: 'in_progress',
        startTime: 1706356800000,
        infrastructureChanged: true,
        commitMessage: 'feat: add new feature',
        commitAuthor: 'developer@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: false,
        integrationTestsPassed: false,
        e2eTestsPassed: false,
        coveragePercentage: 0,
        artifactLocation: 's3://bucket/artifacts/abc123def456',
        expiresAt: 1714132800
      };

      expect(record.deploymentId).toBe('test#1706356800000');
      expect(record.environment).toBe('test');
      expect(record.version).toBe('abc123def456');
      expect(record.status).toBe('in_progress');
      expect(record.startTime).toBe(1706356800000);
      expect(record.infrastructureChanged).toBe(true);
      expect(record.expiresAt).toBe(1714132800);
    });

    it('should create a deployment record with optional fields', () => {
      const record: DeploymentRecord = {
        deploymentId: 'production#1706356800000',
        environment: 'production',
        version: 'xyz789abc',
        status: 'succeeded',
        startTime: 1706356800000,
        endTime: 1706360400000,
        infrastructureChanged: false,
        commitMessage: 'fix: resolve bug',
        commitAuthor: 'developer@example.com',
        pipelineExecutionId: 'exec-456',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifacts/xyz789abc',
        expiresAt: 1714132800
      };

      expect(record.endTime).toBe(1706360400000);
      expect(record.rollbackReason).toBeUndefined();
      expect(record.rollbackLevel).toBeUndefined();
      expect(record.rollbackTime).toBeUndefined();
    });

    it('should create a rolled back deployment record', () => {
      const record: DeploymentRecord = {
        deploymentId: 'staging#1706356800000',
        environment: 'staging',
        version: 'def456ghi',
        status: 'rolled_back',
        startTime: 1706356800000,
        endTime: 1706360400000,
        infrastructureChanged: true,
        commitMessage: 'feat: breaking change',
        commitAuthor: 'developer@example.com',
        pipelineExecutionId: 'exec-789',
        unitTestsPassed: true,
        integrationTestsPassed: false,
        e2eTestsPassed: false,
        coveragePercentage: 82,
        rollbackReason: 'Integration tests failed',
        rollbackLevel: 'stage',
        rollbackTime: 1706358600000,
        artifactLocation: 's3://bucket/artifacts/def456ghi',
        expiresAt: 1714132800
      };

      expect(record.status).toBe('rolled_back');
      expect(record.rollbackReason).toBe('Integration tests failed');
      expect(record.rollbackLevel).toBe('stage');
      expect(record.rollbackTime).toBe(1706358600000);
    });

    it('should have deploymentId in correct format', () => {
      const record: DeploymentRecord = {
        deploymentId: 'test#1706356800000',
        environment: 'test',
        version: 'abc123',
        status: 'in_progress',
        startTime: 1706356800000,
        infrastructureChanged: false,
        commitMessage: 'test',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-1',
        unitTestsPassed: false,
        integrationTestsPassed: false,
        e2eTestsPassed: false,
        coveragePercentage: 0,
        artifactLocation: 's3://bucket/test',
        expiresAt: 1714132800
      };

      expect(record.deploymentId).toMatch(/^(test|staging|production)#\d+$/);
    });

    it('should have coverage percentage between 0 and 100', () => {
      const record: DeploymentRecord = {
        deploymentId: 'test#1706356800000',
        environment: 'test',
        version: 'abc123',
        status: 'succeeded',
        startTime: 1706356800000,
        infrastructureChanged: false,
        commitMessage: 'test',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-1',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/test',
        expiresAt: 1714132800
      };

      expect(record.coveragePercentage).toBeGreaterThanOrEqual(0);
      expect(record.coveragePercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('AlarmInfo Interface', () => {
    it('should create alarm info with OK state', () => {
      const alarm: AlarmInfo = {
        name: 'kiro-worker-test-high-error-rate',
        state: 'OK'
      };

      expect(alarm.name).toBe('kiro-worker-test-high-error-rate');
      expect(alarm.state).toBe('OK');
      expect(alarm.reason).toBeUndefined();
    });

    it('should create alarm info with ALARM state and reason', () => {
      const alarm: AlarmInfo = {
        name: 'kiro-worker-production-high-error-rate',
        state: 'ALARM',
        reason: 'Threshold Crossed: 5 datapoints were greater than the threshold (10.0)'
      };

      expect(alarm.state).toBe('ALARM');
      expect(alarm.reason).toBeDefined();
      expect(alarm.reason).toContain('Threshold Crossed');
    });

    it('should create alarm info with INSUFFICIENT_DATA state', () => {
      const alarm: AlarmInfo = {
        name: 'kiro-worker-staging-response-time',
        state: 'INSUFFICIENT_DATA',
        reason: 'Insufficient data to evaluate alarm'
      };

      expect(alarm.state).toBe('INSUFFICIENT_DATA');
    });

    it('should accept all valid alarm states', () => {
      const okAlarm: AlarmInfo = { name: 'alarm1', state: 'OK' };
      const alarmAlarm: AlarmInfo = { name: 'alarm2', state: 'ALARM' };
      const insufficientAlarm: AlarmInfo = { name: 'alarm3', state: 'INSUFFICIENT_DATA' };

      expect([okAlarm.state, alarmAlarm.state, insufficientAlarm.state]).toEqual([
        'OK',
        'ALARM',
        'INSUFFICIENT_DATA'
      ]);
    });
  });

  describe('HealthCheckResult Interface', () => {
    it('should create successful health check result', () => {
      const result: HealthCheckResult = {
        success: true,
        failedAlarms: [],
        timestamp: 1706356800000
      };

      expect(result.success).toBe(true);
      expect(result.failedAlarms).toHaveLength(0);
      expect(result.timestamp).toBe(1706356800000);
    });

    it('should create failed health check result with failed alarms', () => {
      const result: HealthCheckResult = {
        success: false,
        failedAlarms: [
          {
            name: 'kiro-worker-test-error-rate',
            state: 'ALARM',
            reason: 'Error rate exceeded threshold'
          },
          {
            name: 'kiro-worker-test-response-time',
            state: 'ALARM',
            reason: 'Response time too high'
          }
        ],
        timestamp: 1706356800000
      };

      expect(result.success).toBe(false);
      expect(result.failedAlarms).toHaveLength(2);
      expect(result.failedAlarms[0].state).toBe('ALARM');
      expect(result.failedAlarms[1].state).toBe('ALARM');
    });

    it('should create health check result without timestamp', () => {
      const result: HealthCheckResult = {
        success: true,
        failedAlarms: []
      };

      expect(result.timestamp).toBeUndefined();
    });
  });

  describe('TestResults Interface', () => {
    it('should create test results with all tests passing', () => {
      const results: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        testSummary: {
          total: 150,
          passed: 150,
          failed: 0,
          skipped: 0
        }
      };

      expect(results.unitTestsPassed).toBe(true);
      expect(results.integrationTestsPassed).toBe(true);
      expect(results.e2eTestsPassed).toBe(true);
      expect(results.coveragePercentage).toBe(85);
      expect(results.testSummary.passed).toBe(150);
      expect(results.testSummary.failed).toBe(0);
    });

    it('should create test results with failures', () => {
      const results: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: false,
        e2eTestsPassed: false,
        coveragePercentage: 78,
        testSummary: {
          total: 150,
          passed: 145,
          failed: 3,
          skipped: 2
        },
        failedTests: [
          {
            name: 'should handle timeout',
            suite: 'Integration Tests',
            error: 'Timeout exceeded',
            stackTrace: 'at TestRunner.run (test-runner.ts:45)'
          },
          {
            name: 'should rollback on failure',
            suite: 'E2E Tests',
            error: 'Rollback failed',
            stackTrace: 'at RollbackOrchestrator.execute (rollback.ts:120)'
          }
        ]
      };

      expect(results.integrationTestsPassed).toBe(false);
      expect(results.e2eTestsPassed).toBe(false);
      expect(results.testSummary.failed).toBe(3);
      expect(results.failedTests).toHaveLength(2);
      expect(results.failedTests![0].name).toBe('should handle timeout');
    });

    it('should validate test summary totals', () => {
      const results: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 90,
        testSummary: {
          total: 100,
          passed: 95,
          failed: 3,
          skipped: 2
        }
      };

      const { total, passed, failed, skipped } = results.testSummary;
      expect(passed + failed + skipped).toBe(total);
    });

    it('should have coverage percentage in valid range', () => {
      const results: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 82,
        testSummary: {
          total: 50,
          passed: 50,
          failed: 0,
          skipped: 0
        }
      };

      expect(results.coveragePercentage).toBeGreaterThanOrEqual(0);
      expect(results.coveragePercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('FailedTest Interface', () => {
    it('should create failed test with all fields', () => {
      const failedTest: FailedTest = {
        name: 'should deploy successfully',
        suite: 'Deployment Tests',
        error: 'Deployment failed: timeout exceeded',
        stackTrace: 'at DeploymentManager.deploy (deployment.ts:89)\nat TestRunner.run (test.ts:45)'
      };

      expect(failedTest.name).toBe('should deploy successfully');
      expect(failedTest.suite).toBe('Deployment Tests');
      expect(failedTest.error).toContain('timeout exceeded');
      expect(failedTest.stackTrace).toContain('deployment.ts:89');
    });

    it('should create failed test without stack trace', () => {
      const failedTest: FailedTest = {
        name: 'should validate input',
        suite: 'Validation Tests',
        error: 'Invalid input provided'
      };

      expect(failedTest.stackTrace).toBeUndefined();
    });
  });

  describe('SecurityViolation Interface', () => {
    it('should create CRITICAL severity violation', () => {
      const violation: SecurityViolation = {
        severity: 'CRITICAL',
        description: 'S3 bucket allows public access',
        resource: 'AWS::S3::Bucket/ArtifactsBucket',
        rule: 's3_bucket_public_access',
        remediation: 'Enable BlockPublicAccess on the S3 bucket'
      };

      expect(violation.severity).toBe('CRITICAL');
      expect(violation.description).toContain('public access');
      expect(violation.resource).toContain('S3::Bucket');
      expect(violation.rule).toBe('s3_bucket_public_access');
      expect(violation.remediation).toBeDefined();
    });

    it('should create HIGH severity violation', () => {
      const violation: SecurityViolation = {
        severity: 'HIGH',
        description: 'IAM role has wildcard permissions',
        resource: 'AWS::IAM::Role/CodeBuildRole',
        rule: 'iam_no_wildcard'
      };

      expect(violation.severity).toBe('HIGH');
      expect(violation.remediation).toBeUndefined();
    });

    it('should create MEDIUM severity violation', () => {
      const violation: SecurityViolation = {
        severity: 'MEDIUM',
        description: 'Lambda function missing DLQ configuration'
      };

      expect(violation.severity).toBe('MEDIUM');
      expect(violation.resource).toBeUndefined();
      expect(violation.rule).toBeUndefined();
    });

    it('should create LOW severity violation', () => {
      const violation: SecurityViolation = {
        severity: 'LOW',
        description: 'CloudWatch log group retention not set',
        resource: 'AWS::Logs::LogGroup/PipelineLogGroup'
      };

      expect(violation.severity).toBe('LOW');
    });

    it('should accept all valid severity levels', () => {
      const critical: SecurityViolation = { severity: 'CRITICAL', description: 'test' };
      const high: SecurityViolation = { severity: 'HIGH', description: 'test' };
      const medium: SecurityViolation = { severity: 'MEDIUM', description: 'test' };
      const low: SecurityViolation = { severity: 'LOW', description: 'test' };

      expect([critical.severity, high.severity, medium.severity, low.severity]).toEqual([
        'CRITICAL',
        'HIGH',
        'MEDIUM',
        'LOW'
      ]);
    });
  });

  describe('Type Compatibility', () => {
    it('should allow DeploymentRecord to be used in arrays', () => {
      const records: DeploymentRecord[] = [
        {
          deploymentId: 'test#1',
          environment: 'test',
          version: 'v1',
          status: 'succeeded',
          startTime: 1706356800000,
          infrastructureChanged: false,
          commitMessage: 'test',
          commitAuthor: 'test@example.com',
          pipelineExecutionId: 'exec-1',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 85,
          artifactLocation: 's3://bucket/v1',
          expiresAt: 1714132800
        }
      ];

      expect(records).toHaveLength(1);
      expect(records[0].environment).toBe('test');
    });

    it('should allow partial updates with Partial type', () => {
      const update: Partial<DeploymentRecord> = {
        status: 'succeeded',
        endTime: 1706360400000,
        coveragePercentage: 88
      };

      expect(update.status).toBe('succeeded');
      expect(update.endTime).toBe(1706360400000);
      expect(update.deploymentId).toBeUndefined();
    });

    it('should work with Record type for environment mapping', () => {
      const deploymentsByEnv: Record<Environment, DeploymentRecord> = {
        test: {
          deploymentId: 'test#1',
          environment: 'test',
          version: 'v1',
          status: 'succeeded',
          startTime: 1706356800000,
          infrastructureChanged: false,
          commitMessage: 'test',
          commitAuthor: 'test@example.com',
          pipelineExecutionId: 'exec-1',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 85,
          artifactLocation: 's3://bucket/v1',
          expiresAt: 1714132800
        },
        staging: {
          deploymentId: 'staging#1',
          environment: 'staging',
          version: 'v1',
          status: 'succeeded',
          startTime: 1706356800000,
          infrastructureChanged: false,
          commitMessage: 'test',
          commitAuthor: 'test@example.com',
          pipelineExecutionId: 'exec-2',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 87,
          artifactLocation: 's3://bucket/v1',
          expiresAt: 1714132800
        },
        production: {
          deploymentId: 'production#1',
          environment: 'production',
          version: 'v1',
          status: 'succeeded',
          startTime: 1706356800000,
          infrastructureChanged: false,
          commitMessage: 'test',
          commitAuthor: 'test@example.com',
          pipelineExecutionId: 'exec-3',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 90,
          artifactLocation: 's3://bucket/v1',
          expiresAt: 1714132800
        }
      };

      expect(Object.keys(deploymentsByEnv)).toHaveLength(3);
      expect(deploymentsByEnv.test.environment).toBe('test');
      expect(deploymentsByEnv.staging.environment).toBe('staging');
      expect(deploymentsByEnv.production.environment).toBe('production');
    });
  });
});
