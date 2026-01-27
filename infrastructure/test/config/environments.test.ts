import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ENVIRONMENTS,
  getEnvironmentConfig,
  validateEnvironmentConfig,
  getAvailableEnvironments,
  type EnvironmentConfig,
} from '../../lib/config/environments';

describe('Environment Configuration', () => {
  describe('ENVIRONMENTS constant', () => {
    it('should define test environment configuration', () => {
      expect(ENVIRONMENTS.test).toBeDefined();
      expect(ENVIRONMENTS.test.environment).toBe('test');
      expect(ENVIRONMENTS.test.region).toBe('us-east-1');
      expect(ENVIRONMENTS.test.coverageThreshold).toBe(80);
      expect(ENVIRONMENTS.test.pollingInterval).toBe('rate(5 minutes)');
    });

    it('should define staging environment configuration', () => {
      expect(ENVIRONMENTS.staging).toBeDefined();
      expect(ENVIRONMENTS.staging.environment).toBe('staging');
      expect(ENVIRONMENTS.staging.region).toBe('us-east-1');
      expect(ENVIRONMENTS.staging.coverageThreshold).toBe(80);
      expect(ENVIRONMENTS.staging.pollingInterval).toBe('rate(10 minutes)');
    });

    it('should define production environment configuration', () => {
      expect(ENVIRONMENTS.production).toBeDefined();
      expect(ENVIRONMENTS.production.environment).toBe('production');
      expect(ENVIRONMENTS.production.region).toBe('us-east-1');
      expect(ENVIRONMENTS.production.coverageThreshold).toBe(80);
      expect(ENVIRONMENTS.production.pollingInterval).toBe('rate(15 minutes)');
    });

    it('should have different polling intervals for each environment', () => {
      expect(ENVIRONMENTS.test.pollingInterval).not.toBe(ENVIRONMENTS.staging.pollingInterval);
      expect(ENVIRONMENTS.staging.pollingInterval).not.toBe(ENVIRONMENTS.production.pollingInterval);
    });

    it('should have appropriate artifact retention for each environment', () => {
      expect(ENVIRONMENTS.test.artifactRetentionDays).toBe(30);
      expect(ENVIRONMENTS.staging.artifactRetentionDays).toBe(60);
      expect(ENVIRONMENTS.production.artifactRetentionDays).toBe(90);
    });

    it('should have appropriate log retention for each environment', () => {
      expect(ENVIRONMENTS.test.logRetentionDays).toBe(7);
      expect(ENVIRONMENTS.staging.logRetentionDays).toBe(14);
      expect(ENVIRONMENTS.production.logRetentionDays).toBe(30);
    });

    it('should enable detailed metrics for test and staging', () => {
      expect(ENVIRONMENTS.test.enableDetailedMetrics).toBe(true);
      expect(ENVIRONMENTS.staging.enableDetailedMetrics).toBe(true);
    });

    it('should disable detailed metrics for production', () => {
      expect(ENVIRONMENTS.production.enableDetailedMetrics).toBe(false);
    });

    it('should use SMALL compute type for all environments', () => {
      expect(ENVIRONMENTS.test.codeBuildComputeType).toBe('SMALL');
      expect(ENVIRONMENTS.staging.codeBuildComputeType).toBe('SMALL');
      expect(ENVIRONMENTS.production.codeBuildComputeType).toBe('SMALL');
    });

    it('should have consistent timeout values', () => {
      expect(ENVIRONMENTS.test.codeBuildTimeout).toBe(60);
      expect(ENVIRONMENTS.test.lambdaTimeout).toBe(15);
      expect(ENVIRONMENTS.test.lockTTLHours).toBe(2);
    });
  });

  describe('CD Pipeline Configuration', () => {
    it('should have pipeline enabled for all environments', () => {
      expect(ENVIRONMENTS.test.pipelineEnabled).toBe(true);
      expect(ENVIRONMENTS.staging.pipelineEnabled).toBe(true);
      expect(ENVIRONMENTS.production.pipelineEnabled).toBe(true);
    });

    it('should have GitHub owner configured for all environments', () => {
      expect(ENVIRONMENTS.test.githubOwner).toBeDefined();
      expect(ENVIRONMENTS.staging.githubOwner).toBeDefined();
      expect(ENVIRONMENTS.production.githubOwner).toBeDefined();
    });

    it('should have GitHub repo configured for all environments', () => {
      expect(ENVIRONMENTS.test.githubRepo).toBeDefined();
      expect(ENVIRONMENTS.staging.githubRepo).toBeDefined();
      expect(ENVIRONMENTS.production.githubRepo).toBeDefined();
    });

    it('should have health check duration of 5 minutes for test environment', () => {
      expect(ENVIRONMENTS.test.healthCheckDuration).toBe(5);
    });

    it('should have health check duration of 5 minutes for staging environment', () => {
      expect(ENVIRONMENTS.staging.healthCheckDuration).toBe(5);
    });

    it('should have health check duration of 10 minutes for production environment', () => {
      expect(ENVIRONMENTS.production.healthCheckDuration).toBe(10);
    });

    it('should have stricter health check duration for production', () => {
      expect(ENVIRONMENTS.production.healthCheckDuration).toBeGreaterThan(ENVIRONMENTS.test.healthCheckDuration!);
      expect(ENVIRONMENTS.production.healthCheckDuration).toBeGreaterThan(ENVIRONMENTS.staging.healthCheckDuration!);
    });

    it('should have alarm prefixes configured for test environment', () => {
      expect(ENVIRONMENTS.test.alarmPrefixes).toBeDefined();
      expect(ENVIRONMENTS.test.alarmPrefixes).toContain('kiro-worker-test');
    });

    it('should have alarm prefixes configured for staging environment', () => {
      expect(ENVIRONMENTS.staging.alarmPrefixes).toBeDefined();
      expect(ENVIRONMENTS.staging.alarmPrefixes).toContain('kiro-worker-staging');
    });

    it('should have alarm prefixes configured for production environment', () => {
      expect(ENVIRONMENTS.production.alarmPrefixes).toBeDefined();
      expect(ENVIRONMENTS.production.alarmPrefixes).toContain('kiro-worker-production');
    });

    it('should have environment-specific alarm prefixes', () => {
      expect(ENVIRONMENTS.test.alarmPrefixes).not.toEqual(ENVIRONMENTS.staging.alarmPrefixes);
      expect(ENVIRONMENTS.staging.alarmPrefixes).not.toEqual(ENVIRONMENTS.production.alarmPrefixes);
    });

    it('should use environment variables for GitHub owner with fallback', () => {
      // The actual value will be from env var or default
      expect(typeof ENVIRONMENTS.test.githubOwner).toBe('string');
      expect(ENVIRONMENTS.test.githubOwner).toBeTruthy();
    });

    it('should use environment variables for GitHub repo with fallback', () => {
      // The actual value will be from env var or default
      expect(typeof ENVIRONMENTS.test.githubRepo).toBe('string');
      expect(ENVIRONMENTS.test.githubRepo).toBeTruthy();
    });
  });

  describe('getEnvironmentConfig', () => {
    let originalAccount: string | undefined;

    beforeEach(() => {
      originalAccount = process.env.CDK_DEFAULT_ACCOUNT;
      process.env.CDK_DEFAULT_ACCOUNT = '123456789012';
    });

    afterEach(() => {
      if (originalAccount !== undefined) {
        process.env.CDK_DEFAULT_ACCOUNT = originalAccount;
      } else {
        delete process.env.CDK_DEFAULT_ACCOUNT;
      }
    });

    it('should return test environment configuration', () => {
      const config = getEnvironmentConfig('test');
      expect(config.environment).toBe('test');
      expect(config.account).toBe('123456789012');
    });

    it('should return staging environment configuration', () => {
      const config = getEnvironmentConfig('staging');
      expect(config.environment).toBe('staging');
      expect(config.account).toBe('123456789012');
    });

    it('should return production environment configuration', () => {
      const config = getEnvironmentConfig('production');
      expect(config.environment).toBe('production');
      expect(config.account).toBe('123456789012');
    });

    it('should throw error for invalid environment name', () => {
      expect(() => getEnvironmentConfig('invalid')).toThrow(
        'Invalid environment: invalid. Valid environments: test, staging, production'
      );
    });

    it('should throw error for empty environment name', () => {
      expect(() => getEnvironmentConfig('')).toThrow('Invalid environment');
    });

    it('should throw error when account is not configured', () => {
      delete process.env.CDK_DEFAULT_ACCOUNT;
      
      expect(() => getEnvironmentConfig('test')).toThrow(
        'AWS account not configured for environment: test'
      );
    });

    it('should include helpful message about setting CDK_DEFAULT_ACCOUNT', () => {
      delete process.env.CDK_DEFAULT_ACCOUNT;
      
      expect(() => getEnvironmentConfig('test')).toThrow(
        'Set CDK_DEFAULT_ACCOUNT environment variable'
      );
    });
  });

  describe('validateEnvironmentConfig', () => {
    let validConfig: EnvironmentConfig;

    beforeEach(() => {
      validConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
    });

    it('should validate a valid configuration without throwing', () => {
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should throw error for missing account', () => {
      validConfig.account = '';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow('AWS account ID is required');
    });

    it('should throw error for invalid account format (too short)', () => {
      validConfig.account = '12345';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid AWS account ID: 12345. Must be 12 digits.'
      );
    });

    it('should throw error for invalid account format (too long)', () => {
      validConfig.account = '1234567890123';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid AWS account ID: 1234567890123. Must be 12 digits.'
      );
    });

    it('should throw error for invalid account format (non-numeric)', () => {
      validConfig.account = 'abc123456789';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid AWS account ID: abc123456789. Must be 12 digits.'
      );
    });

    it('should throw error for missing region', () => {
      validConfig.region = '';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow('AWS region is required');
    });

    it('should throw error for coverage threshold below 0', () => {
      validConfig.coverageThreshold = -1;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid coverage threshold: -1. Must be between 0 and 100.'
      );
    });

    it('should throw error for coverage threshold above 100', () => {
      validConfig.coverageThreshold = 101;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid coverage threshold: 101. Must be between 0 and 100.'
      );
    });

    it('should accept coverage threshold of 0', () => {
      validConfig.coverageThreshold = 0;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept coverage threshold of 100', () => {
      validConfig.coverageThreshold = 100;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should validate rate-based polling interval', () => {
      validConfig.pollingInterval = 'rate(10 minutes)';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should validate rate-based polling interval with singular unit', () => {
      validConfig.pollingInterval = 'rate(1 minute)';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should validate rate-based polling interval with hours', () => {
      validConfig.pollingInterval = 'rate(2 hours)';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should validate rate-based polling interval with days', () => {
      validConfig.pollingInterval = 'rate(1 day)';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should validate cron-based polling interval', () => {
      validConfig.pollingInterval = 'cron(0 12 * * ? *)';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should throw error for invalid polling interval format', () => {
      validConfig.pollingInterval = 'every 5 minutes';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid polling interval: every 5 minutes'
      );
    });

    it('should throw error for empty polling interval', () => {
      validConfig.pollingInterval = '';
      expect(() => validateEnvironmentConfig(validConfig)).toThrow('Invalid polling interval');
    });

    it('should throw error for negative CodeBuild timeout', () => {
      validConfig.codeBuildTimeout = -1;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid CodeBuild timeout: -1. Must be positive.'
      );
    });

    it('should throw error for zero CodeBuild timeout', () => {
      validConfig.codeBuildTimeout = 0;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid CodeBuild timeout: 0. Must be positive.'
      );
    });

    it('should accept positive CodeBuild timeout', () => {
      validConfig.codeBuildTimeout = 60;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should throw error for negative Lambda timeout', () => {
      validConfig.lambdaTimeout = -1;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid Lambda timeout: -1. Must be positive.'
      );
    });

    it('should accept positive Lambda timeout', () => {
      validConfig.lambdaTimeout = 15;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should throw error for negative lock TTL', () => {
      validConfig.lockTTLHours = -1;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid lock TTL: -1. Must be positive.'
      );
    });

    it('should accept positive lock TTL', () => {
      validConfig.lockTTLHours = 2;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should throw error for negative artifact retention', () => {
      validConfig.artifactRetentionDays = -1;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid artifact retention: -1. Must be positive.'
      );
    });

    it('should accept positive artifact retention', () => {
      validConfig.artifactRetentionDays = 90;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should throw error for negative log retention', () => {
      validConfig.logRetentionDays = -1;
      expect(() => validateEnvironmentConfig(validConfig)).toThrow(
        'Invalid log retention: -1. Must be positive.'
      );
    });

    it('should accept positive log retention', () => {
      validConfig.logRetentionDays = 30;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept configuration with all optional fields', () => {
      const fullConfig: EnvironmentConfig = {
        ...validConfig,
        vpcId: 'vpc-12345678',
        codeBuildComputeType: 'MEDIUM',
        codeBuildTimeout: 120,
        lambdaTimeout: 10,
        lockTTLHours: 4,
        artifactRetentionDays: 60,
        logRetentionDays: 14,
        enableDetailedMetrics: true,
        alertEmail: 'alerts@example.com',
      };
      
      expect(() => validateEnvironmentConfig(fullConfig)).not.toThrow();
    });
  });

  describe('getAvailableEnvironments', () => {
    it('should return array of environment names', () => {
      const environments = getAvailableEnvironments();
      expect(environments).toEqual(['test', 'staging', 'production']);
    });

    it('should return array with correct length', () => {
      const environments = getAvailableEnvironments();
      expect(environments).toHaveLength(3);
    });

    it('should include test environment', () => {
      const environments = getAvailableEnvironments();
      expect(environments).toContain('test');
    });

    it('should include staging environment', () => {
      const environments = getAvailableEnvironments();
      expect(environments).toContain('staging');
    });

    it('should include production environment', () => {
      const environments = getAvailableEnvironments();
      expect(environments).toContain('production');
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace in account ID', () => {
      const config: EnvironmentConfig = {
        account: '  ',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(() => validateEnvironmentConfig(config)).toThrow('AWS account ID is required');
    });

    it('should handle whitespace in region', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: '  ',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(() => validateEnvironmentConfig(config)).toThrow('AWS region is required');
    });

    it('should accept valid regions', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-west-2',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should accept eu-west-1 region', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'eu-west-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should accept ap-southeast-1 region', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'ap-southeast-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });
  });

  describe('Type Safety', () => {
    it('should enforce environment type constraint', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(config.environment).toBe('test');
    });

    it('should enforce codeBuildComputeType constraint', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        codeBuildComputeType: 'LARGE',
      };
      
      expect(config.codeBuildComputeType).toBe('LARGE');
    });
  });

  describe('Pipeline Configuration Validation', () => {
    let validConfig: EnvironmentConfig;

    beforeEach(() => {
      validConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        githubOwner: 'test-org',
        githubRepo: 'test-repo',
        healthCheckDuration: 5,
        alarmPrefixes: ['kiro-worker-test'],
        pipelineEnabled: true,
      };
    });

    it('should validate configuration with all pipeline fields', () => {
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept configuration without optional pipeline fields', () => {
      const minimalConfig: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
      };
      
      expect(() => validateEnvironmentConfig(minimalConfig)).not.toThrow();
    });

    it('should accept valid health check duration', () => {
      validConfig.healthCheckDuration = 10;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept health check duration of 1 minute', () => {
      validConfig.healthCheckDuration = 1;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept health check duration of 60 minutes', () => {
      validConfig.healthCheckDuration = 60;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept empty alarm prefixes array', () => {
      validConfig.alarmPrefixes = [];
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept multiple alarm prefixes', () => {
      validConfig.alarmPrefixes = ['kiro-worker-test', 'kiro-pipeline-test', 'custom-alarm'];
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept pipeline enabled as true', () => {
      validConfig.pipelineEnabled = true;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept pipeline enabled as false', () => {
      validConfig.pipelineEnabled = false;
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept valid GitHub owner', () => {
      validConfig.githubOwner = 'my-organization';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept valid GitHub repo', () => {
      validConfig.githubRepo = 'my-repository';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept GitHub owner with hyphens', () => {
      validConfig.githubOwner = 'my-org-name';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });

    it('should accept GitHub repo with hyphens and underscores', () => {
      validConfig.githubRepo = 'my-repo_name';
      expect(() => validateEnvironmentConfig(validConfig)).not.toThrow();
    });
  });

  describe('Pipeline Configuration Completeness', () => {
    it('should have all required pipeline fields in test environment', () => {
      expect(ENVIRONMENTS.test.githubOwner).toBeDefined();
      expect(ENVIRONMENTS.test.githubRepo).toBeDefined();
      expect(ENVIRONMENTS.test.healthCheckDuration).toBeDefined();
      expect(ENVIRONMENTS.test.alarmPrefixes).toBeDefined();
      expect(ENVIRONMENTS.test.pipelineEnabled).toBeDefined();
    });

    it('should have all required pipeline fields in staging environment', () => {
      expect(ENVIRONMENTS.staging.githubOwner).toBeDefined();
      expect(ENVIRONMENTS.staging.githubRepo).toBeDefined();
      expect(ENVIRONMENTS.staging.healthCheckDuration).toBeDefined();
      expect(ENVIRONMENTS.staging.alarmPrefixes).toBeDefined();
      expect(ENVIRONMENTS.staging.pipelineEnabled).toBeDefined();
    });

    it('should have all required pipeline fields in production environment', () => {
      expect(ENVIRONMENTS.production.githubOwner).toBeDefined();
      expect(ENVIRONMENTS.production.githubRepo).toBeDefined();
      expect(ENVIRONMENTS.production.healthCheckDuration).toBeDefined();
      expect(ENVIRONMENTS.production.alarmPrefixes).toBeDefined();
      expect(ENVIRONMENTS.production.pipelineEnabled).toBeDefined();
    });

    it('should have non-empty GitHub owner in all environments', () => {
      expect(ENVIRONMENTS.test.githubOwner).toBeTruthy();
      expect(ENVIRONMENTS.staging.githubOwner).toBeTruthy();
      expect(ENVIRONMENTS.production.githubOwner).toBeTruthy();
    });

    it('should have non-empty GitHub repo in all environments', () => {
      expect(ENVIRONMENTS.test.githubRepo).toBeTruthy();
      expect(ENVIRONMENTS.staging.githubRepo).toBeTruthy();
      expect(ENVIRONMENTS.production.githubRepo).toBeTruthy();
    });

    it('should have positive health check duration in all environments', () => {
      expect(ENVIRONMENTS.test.healthCheckDuration).toBeGreaterThan(0);
      expect(ENVIRONMENTS.staging.healthCheckDuration).toBeGreaterThan(0);
      expect(ENVIRONMENTS.production.healthCheckDuration).toBeGreaterThan(0);
    });

    it('should have alarm prefixes array in all environments', () => {
      expect(Array.isArray(ENVIRONMENTS.test.alarmPrefixes)).toBe(true);
      expect(Array.isArray(ENVIRONMENTS.staging.alarmPrefixes)).toBe(true);
      expect(Array.isArray(ENVIRONMENTS.production.alarmPrefixes)).toBe(true);
    });

    it('should have at least one alarm prefix in all environments', () => {
      expect(ENVIRONMENTS.test.alarmPrefixes!.length).toBeGreaterThan(0);
      expect(ENVIRONMENTS.staging.alarmPrefixes!.length).toBeGreaterThan(0);
      expect(ENVIRONMENTS.production.alarmPrefixes!.length).toBeGreaterThan(0);
    });

    it('should have boolean pipeline enabled flag in all environments', () => {
      expect(typeof ENVIRONMENTS.test.pipelineEnabled).toBe('boolean');
      expect(typeof ENVIRONMENTS.staging.pipelineEnabled).toBe('boolean');
      expect(typeof ENVIRONMENTS.production.pipelineEnabled).toBe('boolean');
    });
  });

  describe('Pipeline Configuration Edge Cases', () => {
    it('should handle undefined pipeline fields gracefully', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        githubOwner: undefined,
        githubRepo: undefined,
        healthCheckDuration: undefined,
        alarmPrefixes: undefined,
        pipelineEnabled: undefined,
      };
      
      // Should not throw - optional fields
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should handle empty string GitHub owner', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        githubOwner: '',
      };
      
      // Should not throw - optional field, validation happens at runtime
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should handle empty string GitHub repo', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        githubRepo: '',
      };
      
      // Should not throw - optional field, validation happens at runtime
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should handle zero health check duration', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        healthCheckDuration: 0,
      };
      
      // Should not throw - optional field, validation happens at runtime
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should handle negative health check duration', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        healthCheckDuration: -5,
      };
      
      // Should not throw - optional field, validation happens at runtime
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });

    it('should handle very large health check duration', () => {
      const config: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        healthCheckDuration: 1440, // 24 hours
      };
      
      expect(() => validateEnvironmentConfig(config)).not.toThrow();
    });
  });

  describe('Pipeline Configuration Consistency', () => {
    it('should have consistent GitHub owner across environments', () => {
      // All environments should use the same GitHub owner
      expect(ENVIRONMENTS.test.githubOwner).toBe(ENVIRONMENTS.staging.githubOwner);
      expect(ENVIRONMENTS.staging.githubOwner).toBe(ENVIRONMENTS.production.githubOwner);
    });

    it('should have consistent GitHub repo across environments', () => {
      // All environments should use the same GitHub repo
      expect(ENVIRONMENTS.test.githubRepo).toBe(ENVIRONMENTS.staging.githubRepo);
      expect(ENVIRONMENTS.staging.githubRepo).toBe(ENVIRONMENTS.production.githubRepo);
    });

    it('should have consistent pipeline enabled flag across environments', () => {
      // All environments should have pipeline enabled
      expect(ENVIRONMENTS.test.pipelineEnabled).toBe(true);
      expect(ENVIRONMENTS.staging.pipelineEnabled).toBe(true);
      expect(ENVIRONMENTS.production.pipelineEnabled).toBe(true);
    });

    it('should have environment-specific health check durations', () => {
      // Test and staging should have same duration
      expect(ENVIRONMENTS.test.healthCheckDuration).toBe(5);
      expect(ENVIRONMENTS.staging.healthCheckDuration).toBe(5);
      // Production should have longer duration
      expect(ENVIRONMENTS.production.healthCheckDuration).toBe(10);
    });

    it('should have environment-specific alarm prefixes', () => {
      // Each environment should have its own alarm prefix
      expect(ENVIRONMENTS.test.alarmPrefixes).toContain('kiro-worker-test');
      expect(ENVIRONMENTS.staging.alarmPrefixes).toContain('kiro-worker-staging');
      expect(ENVIRONMENTS.production.alarmPrefixes).toContain('kiro-worker-production');
    });
  });

  describe('Pipeline Configuration Integration', () => {
    it('should support full configuration with all fields', () => {
      const fullConfig: EnvironmentConfig = {
        account: '123456789012',
        region: 'us-east-1',
        environment: 'test',
        vpcId: 'vpc-12345678',
        coverageThreshold: 80,
        pollingInterval: 'rate(5 minutes)',
        codeBuildComputeType: 'MEDIUM',
        codeBuildTimeout: 120,
        lambdaTimeout: 10,
        lockTTLHours: 4,
        artifactRetentionDays: 60,
        logRetentionDays: 14,
        enableDetailedMetrics: true,
        alertEmail: 'alerts@example.com',
        githubOwner: 'my-org',
        githubRepo: 'my-repo',
        healthCheckDuration: 5,
        alarmPrefixes: ['kiro-worker-test', 'custom-alarm'],
        pipelineEnabled: true,
      };
      
      expect(() => validateEnvironmentConfig(fullConfig)).not.toThrow();
    });

    it('should validate configuration retrieved by getEnvironmentConfig', () => {
      const originalAccount = process.env.CDK_DEFAULT_ACCOUNT;
      process.env.CDK_DEFAULT_ACCOUNT = '123456789012';
      
      try {
        const config = getEnvironmentConfig('test');
        expect(() => validateEnvironmentConfig(config)).not.toThrow();
      } finally {
        if (originalAccount !== undefined) {
          process.env.CDK_DEFAULT_ACCOUNT = originalAccount;
        } else {
          delete process.env.CDK_DEFAULT_ACCOUNT;
        }
      }
    });

    it('should validate all predefined environments', () => {
      const originalAccount = process.env.CDK_DEFAULT_ACCOUNT;
      process.env.CDK_DEFAULT_ACCOUNT = '123456789012';
      
      try {
        const environments = getAvailableEnvironments();
        environments.forEach(envName => {
          const config = getEnvironmentConfig(envName);
          expect(() => validateEnvironmentConfig(config)).not.toThrow();
        });
      } finally {
        if (originalAccount !== undefined) {
          process.env.CDK_DEFAULT_ACCOUNT = originalAccount;
        } else {
          delete process.env.CDK_DEFAULT_ACCOUNT;
        }
      }
    });
  });
});
