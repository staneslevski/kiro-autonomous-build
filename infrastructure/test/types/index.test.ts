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
  SecurityViolation,
  PipelineConfig,
  PipelineEnvironmentConfig,
  BuildConfig,
  MonitoringConfig
} from '../../lib/types';

describe('Type Index Exports', () => {
  describe('Pipeline Types Exports', () => {
    it('should export Environment type', () => {
      const env: Environment = 'test';
      expect(env).toBe('test');
    });

    it('should export DeploymentStatus type', () => {
      const status: DeploymentStatus = 'succeeded';
      expect(status).toBe('succeeded');
    });

    it('should export RollbackLevel type', () => {
      const level: RollbackLevel = 'stage';
      expect(level).toBe('stage');
    });

    it('should export DeploymentRecord interface', () => {
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

      expect(record.deploymentId).toBe('test#1706356800000');
    });

    it('should export AlarmInfo interface', () => {
      const alarm: AlarmInfo = {
        name: 'test-alarm',
        state: 'OK'
      };

      expect(alarm.name).toBe('test-alarm');
      expect(alarm.state).toBe('OK');
    });

    it('should export HealthCheckResult interface', () => {
      const result: HealthCheckResult = {
        success: true,
        failedAlarms: []
      };

      expect(result.success).toBe(true);
      expect(result.failedAlarms).toHaveLength(0);
    });

    it('should export TestResults interface', () => {
      const results: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        testSummary: {
          total: 100,
          passed: 100,
          failed: 0,
          skipped: 0
        }
      };

      expect(results.coveragePercentage).toBe(85);
    });

    it('should export FailedTest interface', () => {
      const failedTest: FailedTest = {
        name: 'test name',
        suite: 'test suite',
        error: 'test error'
      };

      expect(failedTest.name).toBe('test name');
    });

    it('should export SecurityViolation interface', () => {
      const violation: SecurityViolation = {
        severity: 'HIGH',
        description: 'Security issue'
      };

      expect(violation.severity).toBe('HIGH');
    });
  });

  describe('Pipeline Config Exports', () => {
    it('should export PipelineConfig interface', () => {
      // Type check only - if this compiles, the export works
      const config: Partial<PipelineConfig> = {
        environment: 'test',
        account: '123456789012',
        region: 'us-east-1'
      };

      expect(config.environment).toBe('test');
    });

    it('should export PipelineEnvironmentConfig interface', () => {
      // Type check only
      const config: Partial<PipelineEnvironmentConfig> = {
        pipelineEnabled: true,
        requiresApproval: false
      };

      expect(config.pipelineEnabled).toBe(true);
    });

    it('should export BuildConfig interface', () => {
      // Type check only
      const config: Partial<BuildConfig> = {
        nodeVersion: '18',
        computeType: 'SMALL'
      };

      expect(config.nodeVersion).toBe('18');
    });

    it('should export MonitoringConfig interface', () => {
      // Type check only
      const config: Partial<MonitoringConfig> = {
        enableDashboard: true
      };

      expect(config.enableDashboard).toBe(true);
    });
  });

  describe('Cross-Module Type Compatibility', () => {
    it('should allow using types from both modules together', () => {
      const deployment: DeploymentRecord = {
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

      const config: Partial<PipelineConfig> = {
        environment: deployment.environment,
        account: '123456789012',
        region: 'us-east-1'
      };

      expect(config.environment).toBe(deployment.environment);
    });

    it('should support creating deployment records from config', () => {
      const environment: Environment = 'staging';
      
      const record: DeploymentRecord = {
        deploymentId: `${environment}#${Date.now()}`,
        environment: environment,
        version: 'v1.0.0',
        status: 'in_progress',
        startTime: Date.now(),
        infrastructureChanged: true,
        commitMessage: 'deploy',
        commitAuthor: 'ci@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: false,
        integrationTestsPassed: false,
        e2eTestsPassed: false,
        coveragePercentage: 0,
        artifactLocation: 's3://bucket/v1.0.0',
        expiresAt: Math.floor(Date.now() / 1000) + 7776000
      };

      expect(record.environment).toBe('staging');
      expect(record.deploymentId).toContain('staging#');
    });

    it('should support type guards for deployment status', () => {
      const isSuccessfulDeployment = (record: DeploymentRecord): boolean => {
        return record.status === 'succeeded';
      };

      const successRecord: DeploymentRecord = {
        deploymentId: 'test#1',
        environment: 'test',
        version: 'v1',
        status: 'succeeded',
        startTime: Date.now(),
        infrastructureChanged: false,
        commitMessage: 'test',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-1',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 90,
        artifactLocation: 's3://bucket/v1',
        expiresAt: 1714132800
      };

      const failedRecord: DeploymentRecord = {
        ...successRecord,
        status: 'failed'
      };

      expect(isSuccessfulDeployment(successRecord)).toBe(true);
      expect(isSuccessfulDeployment(failedRecord)).toBe(false);
    });

    it('should support filtering deployments by environment', () => {
      const deployments: DeploymentRecord[] = [
        {
          deploymentId: 'test#1',
          environment: 'test',
          version: 'v1',
          status: 'succeeded',
          startTime: Date.now(),
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
        {
          deploymentId: 'production#1',
          environment: 'production',
          version: 'v1',
          status: 'succeeded',
          startTime: Date.now(),
          infrastructureChanged: false,
          commitMessage: 'test',
          commitAuthor: 'test@example.com',
          pipelineExecutionId: 'exec-2',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 90,
          artifactLocation: 's3://bucket/v1',
          expiresAt: 1714132800
        }
      ];

      const productionDeployments = deployments.filter(
        (d) => d.environment === 'production'
      );

      expect(productionDeployments).toHaveLength(1);
      expect(productionDeployments[0].environment).toBe('production');
    });
  });

  describe('Type Export Completeness', () => {
    it('should export all pipeline-types exports', () => {
      // This test verifies that all types from pipeline-types are re-exported
      // If any type is missing, TypeScript compilation will fail
      
      const env: Environment = 'test';
      const status: DeploymentStatus = 'succeeded';
      const level: RollbackLevel = 'stage';
      
      const record: DeploymentRecord = {
        deploymentId: 'test#1',
        environment: env,
        version: 'v1',
        status: status,
        startTime: Date.now(),
        infrastructureChanged: false,
        commitMessage: 'test',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-1',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        rollbackLevel: level,
        artifactLocation: 's3://bucket/v1',
        expiresAt: 1714132800
      };

      const alarm: AlarmInfo = { name: 'test', state: 'OK' };
      const health: HealthCheckResult = { success: true, failedAlarms: [alarm] };
      const test: FailedTest = { name: 'test', suite: 'suite', error: 'error' };
      const violation: SecurityViolation = { severity: 'HIGH', description: 'test' };
      const results: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        testSummary: { total: 1, passed: 1, failed: 0, skipped: 0 },
        failedTests: [test]
      };

      expect(record).toBeDefined();
      expect(health).toBeDefined();
      expect(results).toBeDefined();
      expect(violation).toBeDefined();
    });

    it('should export all pipeline-config exports', () => {
      // This test verifies that all types from pipeline-config are re-exported
      // If any type is missing, TypeScript compilation will fail
      
      const envConfig: Partial<PipelineEnvironmentConfig> = {
        pipelineEnabled: true
      };
      
      const buildConfig: Partial<BuildConfig> = {
        nodeVersion: '18'
      };
      
      const monitoringConfig: Partial<MonitoringConfig> = {
        enableDashboard: true
      };
      
      const pipelineConfig: Partial<PipelineConfig> = {
        environment: 'test',
        environmentConfig: envConfig as PipelineEnvironmentConfig,
        buildConfig: buildConfig as BuildConfig,
        monitoringConfig: monitoringConfig as MonitoringConfig
      };

      expect(pipelineConfig).toBeDefined();
      expect(envConfig).toBeDefined();
      expect(buildConfig).toBeDefined();
      expect(monitoringConfig).toBeDefined();
    });
  });
});
