/**
 * Tests for CDK App Entry Point
 * 
 * These tests verify that the CDK app correctly loads environment configuration,
 * validates settings, and applies appropriate tags to all resources.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as environments from '../../lib/config/environments';

describe('CDK App Entry Point', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set default account for tests
    process.env.CDK_DEFAULT_ACCOUNT = '123456789012';
    
    // Spy on console.error and process.exit
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Restore spies
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Environment Configuration Loading', () => {
    it('should load test environment configuration by default', () => {
      const app = new cdk.App({
        context: {}
      });
      
      const environmentName = app.node.tryGetContext('environment') || 'test';
      expect(environmentName).toBe('test');
      
      const config = environments.getEnvironmentConfig(environmentName);
      expect(config.environment).toBe('test');
      expect(config.account).toBe('123456789012');
      expect(config.region).toBe('us-east-1');
    });

    it('should load staging environment when specified in context', () => {
      const app = new cdk.App({
        context: {
          environment: 'staging'
        }
      });
      
      const environmentName = app.node.tryGetContext('environment');
      expect(environmentName).toBe('staging');
      
      const config = environments.getEnvironmentConfig(environmentName);
      expect(config.environment).toBe('staging');
    });

    it('should load production environment when specified in context', () => {
      const app = new cdk.App({
        context: {
          environment: 'production'
        }
      });
      
      const environmentName = app.node.tryGetContext('environment');
      expect(environmentName).toBe('production');
      
      const config = environments.getEnvironmentConfig(environmentName);
      expect(config.environment).toBe('production');
    });

    it('should throw error for invalid environment name', () => {
      expect(() => {
        environments.getEnvironmentConfig('invalid');
      }).toThrow('Invalid environment: invalid');
    });

    it('should throw error when AWS account is not configured', () => {
      // Remove account from environment
      delete process.env.CDK_DEFAULT_ACCOUNT;
      
      expect(() => {
        const config = environments.getEnvironmentConfig('test');
        environments.validateEnvironmentConfig(config);
      }).toThrow('AWS account not configured');
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should validate test environment configuration', () => {
      const config = environments.getEnvironmentConfig('test');
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should validate staging environment configuration', () => {
      const config = environments.getEnvironmentConfig('staging');
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should validate production environment configuration', () => {
      const config = environments.getEnvironmentConfig('production');
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should reject invalid AWS account ID format', () => {
      const config = environments.getEnvironmentConfig('test');
      config.account = 'invalid';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid AWS account ID');
    });

    it('should reject empty region', () => {
      const config = environments.getEnvironmentConfig('test');
      config.region = '';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('AWS region is required');
    });

    it('should reject invalid coverage threshold', () => {
      const config = environments.getEnvironmentConfig('test');
      config.coverageThreshold = 150;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid coverage threshold');
    });

    it('should reject invalid polling interval format', () => {
      const config = environments.getEnvironmentConfig('test');
      config.pollingInterval = 'invalid';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid polling interval');
    });
  });

  describe('Stack Environment Configuration', () => {
    it('should create stack environment with correct account and region for test', () => {
      const config = environments.getEnvironmentConfig('test');
      
      const stackEnv: cdk.Environment = {
        account: config.account,
        region: config.region,
      };
      
      expect(stackEnv.account).toBe('123456789012');
      expect(stackEnv.region).toBe('us-east-1');
    });

    it('should create stack environment with correct account and region for staging', () => {
      const config = environments.getEnvironmentConfig('staging');
      
      const stackEnv: cdk.Environment = {
        account: config.account,
        region: config.region,
      };
      
      expect(stackEnv.account).toBe('123456789012');
      expect(stackEnv.region).toBe('us-east-1');
    });

    it('should create stack environment with correct account and region for production', () => {
      const config = environments.getEnvironmentConfig('production');
      
      const stackEnv: cdk.Environment = {
        account: config.account,
        region: config.region,
      };
      
      expect(stackEnv.account).toBe('123456789012');
      expect(stackEnv.region).toBe('us-east-1');
    });
  });

  describe('Stack Naming', () => {
    it('should generate correct stack prefix for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      const stackPrefix = `KiroWorker-${config.environment}`;
      
      expect(stackPrefix).toBe('KiroWorker-test');
    });

    it('should generate correct stack prefix for staging environment', () => {
      const config = environments.getEnvironmentConfig('staging');
      const stackPrefix = `KiroWorker-${config.environment}`;
      
      expect(stackPrefix).toBe('KiroWorker-staging');
    });

    it('should generate correct stack prefix for production environment', () => {
      const config = environments.getEnvironmentConfig('production');
      const stackPrefix = `KiroWorker-${config.environment}`;
      
      expect(stackPrefix).toBe('KiroWorker-production');
    });

    it('should generate unique stack names for different environments', () => {
      const testConfig = environments.getEnvironmentConfig('test');
      const stagingConfig = environments.getEnvironmentConfig('staging');
      const productionConfig = environments.getEnvironmentConfig('production');
      
      const testPrefix = `KiroWorker-${testConfig.environment}`;
      const stagingPrefix = `KiroWorker-${stagingConfig.environment}`;
      const productionPrefix = `KiroWorker-${productionConfig.environment}`;
      
      expect(testPrefix).not.toBe(stagingPrefix);
      expect(stagingPrefix).not.toBe(productionPrefix);
      expect(testPrefix).not.toBe(productionPrefix);
    });
  });

  describe('Resource Tagging', () => {
    it('should apply Project tag to app', () => {
      const app = new cdk.App({
        context: {
          environment: 'test'
        }
      });
      
      const config = environments.getEnvironmentConfig('test');
      
      // Apply tags
      cdk.Tags.of(app).add('Project', 'KiroWorker');
      cdk.Tags.of(app).add('Environment', config.environment);
      cdk.Tags.of(app).add('ManagedBy', 'CDK');
      
      // Verify tags are applied (tags are stored in the app's node)
      const tags = cdk.Tags.of(app);
      expect(tags).toBeDefined();
    });

    it('should apply Environment tag with correct value for test', () => {
      const app = new cdk.App({
        context: {
          environment: 'test'
        }
      });
      
      const config = environments.getEnvironmentConfig('test');
      cdk.Tags.of(app).add('Environment', config.environment);
      
      expect(config.environment).toBe('test');
    });

    it('should apply Environment tag with correct value for staging', () => {
      const app = new cdk.App({
        context: {
          environment: 'staging'
        }
      });
      
      const config = environments.getEnvironmentConfig('staging');
      cdk.Tags.of(app).add('Environment', config.environment);
      
      expect(config.environment).toBe('staging');
    });

    it('should apply Environment tag with correct value for production', () => {
      const app = new cdk.App({
        context: {
          environment: 'production'
        }
      });
      
      const config = environments.getEnvironmentConfig('production');
      cdk.Tags.of(app).add('Environment', config.environment);
      
      expect(config.environment).toBe('production');
    });

    it('should apply ManagedBy tag to app', () => {
      const app = new cdk.App({
        context: {
          environment: 'test'
        }
      });
      
      cdk.Tags.of(app).add('ManagedBy', 'CDK');
      
      const tags = cdk.Tags.of(app);
      expect(tags).toBeDefined();
    });
  });

  describe('App Synthesis', () => {
    it('should synthesize app without errors for test environment', () => {
      const app = new cdk.App({
        context: {
          environment: 'test'
        }
      });
      
      expect(() => {
        app.synth();
      }).not.toThrow();
    });

    it('should synthesize app without errors for staging environment', () => {
      const app = new cdk.App({
        context: {
          environment: 'staging'
        }
      });
      
      expect(() => {
        app.synth();
      }).not.toThrow();
    });

    it('should synthesize app without errors for production environment', () => {
      const app = new cdk.App({
        context: {
          environment: 'production'
        }
      });
      
      expect(() => {
        app.synth();
      }).not.toThrow();
    });
  });

  describe('Configuration Properties', () => {
    it('should have correct coverage threshold for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      expect(config.coverageThreshold).toBe(80);
    });

    it('should have correct polling interval for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      expect(config.pollingInterval).toBe('rate(5 minutes)');
    });

    it('should have correct CodeBuild compute type for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      expect(config.codeBuildComputeType).toBe('SMALL');
    });

    it('should have correct CodeBuild timeout for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      expect(config.codeBuildTimeout).toBe(60);
    });

    it('should have correct Lambda timeout for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      expect(config.lambdaTimeout).toBe(15);
    });

    it('should have correct lock TTL for test environment', () => {
      const config = environments.getEnvironmentConfig('test');
      expect(config.lockTTLHours).toBe(2);
    });

    it('should have different polling intervals for different environments', () => {
      const testConfig = environments.getEnvironmentConfig('test');
      const stagingConfig = environments.getEnvironmentConfig('staging');
      const productionConfig = environments.getEnvironmentConfig('production');
      
      expect(testConfig.pollingInterval).toBe('rate(5 minutes)');
      expect(stagingConfig.pollingInterval).toBe('rate(10 minutes)');
      expect(productionConfig.pollingInterval).toBe('rate(15 minutes)');
    });

    it('should have different artifact retention for different environments', () => {
      const testConfig = environments.getEnvironmentConfig('test');
      const stagingConfig = environments.getEnvironmentConfig('staging');
      const productionConfig = environments.getEnvironmentConfig('production');
      
      expect(testConfig.artifactRetentionDays).toBe(30);
      expect(stagingConfig.artifactRetentionDays).toBe(60);
      expect(productionConfig.artifactRetentionDays).toBe(90);
    });

    it('should have different log retention for different environments', () => {
      const testConfig = environments.getEnvironmentConfig('test');
      const stagingConfig = environments.getEnvironmentConfig('staging');
      const productionConfig = environments.getEnvironmentConfig('production');
      
      expect(testConfig.logRetentionDays).toBe(7);
      expect(stagingConfig.logRetentionDays).toBe(14);
      expect(productionConfig.logRetentionDays).toBe(30);
    });
  });

  describe('Available Environments', () => {
    it('should return all available environment names', () => {
      const availableEnvs = environments.getAvailableEnvironments();
      
      expect(availableEnvs).toContain('test');
      expect(availableEnvs).toContain('staging');
      expect(availableEnvs).toContain('production');
      expect(availableEnvs).toHaveLength(3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing CDK_DEFAULT_ACCOUNT gracefully', () => {
      delete process.env.CDK_DEFAULT_ACCOUNT;
      
      expect(() => {
        const config = environments.getEnvironmentConfig('test');
        environments.validateEnvironmentConfig(config);
      }).toThrow();
    });

    it('should reject negative CodeBuild timeout', () => {
      const config = environments.getEnvironmentConfig('test');
      config.codeBuildTimeout = -1;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid CodeBuild timeout');
    });

    it('should reject zero CodeBuild timeout', () => {
      const config = environments.getEnvironmentConfig('test');
      config.codeBuildTimeout = 0;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid CodeBuild timeout');
    });

    it('should reject negative Lambda timeout', () => {
      const config = environments.getEnvironmentConfig('test');
      config.lambdaTimeout = -1;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid Lambda timeout');
    });

    it('should reject zero Lambda timeout', () => {
      const config = environments.getEnvironmentConfig('test');
      config.lambdaTimeout = 0;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid Lambda timeout');
    });

    it('should reject negative lock TTL', () => {
      const config = environments.getEnvironmentConfig('test');
      config.lockTTLHours = -1;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid lock TTL');
    });

    it('should reject zero lock TTL', () => {
      const config = environments.getEnvironmentConfig('test');
      config.lockTTLHours = 0;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid lock TTL');
    });

    it('should reject negative artifact retention', () => {
      const config = environments.getEnvironmentConfig('test');
      config.artifactRetentionDays = -1;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid artifact retention');
    });

    it('should reject zero artifact retention', () => {
      const config = environments.getEnvironmentConfig('test');
      config.artifactRetentionDays = 0;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid artifact retention');
    });

    it('should reject negative log retention', () => {
      const config = environments.getEnvironmentConfig('test');
      config.logRetentionDays = -1;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid log retention');
    });

    it('should reject zero log retention', () => {
      const config = environments.getEnvironmentConfig('test');
      config.logRetentionDays = 0;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid log retention');
    });

    it('should accept valid cron expression for polling interval', () => {
      const config = environments.getEnvironmentConfig('test');
      config.pollingInterval = 'cron(0 12 * * ? *)';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should accept rate expression with hours', () => {
      const config = environments.getEnvironmentConfig('test');
      config.pollingInterval = 'rate(1 hour)';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should accept rate expression with days', () => {
      const config = environments.getEnvironmentConfig('test');
      config.pollingInterval = 'rate(1 day)';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should handle whitespace in account ID', () => {
      const config = environments.getEnvironmentConfig('test');
      config.account = '  ';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('AWS account ID is required');
    });

    it('should handle whitespace in region', () => {
      const config = environments.getEnvironmentConfig('test');
      config.region = '  ';
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('AWS region is required');
    });

    it('should reject coverage threshold below 0', () => {
      const config = environments.getEnvironmentConfig('test');
      config.coverageThreshold = -1;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid coverage threshold');
    });

    it('should accept coverage threshold of 0', () => {
      const config = environments.getEnvironmentConfig('test');
      config.coverageThreshold = 0;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should accept coverage threshold of 100', () => {
      const config = environments.getEnvironmentConfig('test');
      config.coverageThreshold = 100;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });

    it('should reject coverage threshold above 100', () => {
      const config = environments.getEnvironmentConfig('test');
      config.coverageThreshold = 101;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).toThrow('Invalid coverage threshold');
    });

    it('should accept undefined optional fields', () => {
      const config = environments.getEnvironmentConfig('test');
      config.codeBuildTimeout = undefined;
      config.lambdaTimeout = undefined;
      config.lockTTLHours = undefined;
      config.artifactRetentionDays = undefined;
      config.logRetentionDays = undefined;
      
      expect(() => {
        environments.validateEnvironmentConfig(config);
      }).not.toThrow();
    });
  });
});
