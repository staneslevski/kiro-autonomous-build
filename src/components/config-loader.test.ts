import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from './config-loader';
import { ValidationError } from '../errors';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmMock = mockClient(SSMClient);

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    ssmMock.reset();
    loader = new ConfigLoader('us-east-1');
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load configuration from environment variables', async () => {
      process.env.ENVIRONMENT = 'test';
      process.env.BRANCH_NAME = 'feature-branch';
      process.env.SPEC_PATH = '.kiro/specs/feature-branch';
      process.env.SPEC_TASK_ID = 'task-123';
      process.env.COVERAGE_THRESHOLD = '85';

      const config = await loader.loadConfig('/test/repo');

      expect(config.environment).toBe('test');
      expect(config.branchName).toBe('feature-branch');
      expect(config.specPath).toBe('.kiro/specs/feature-branch');
      expect(config.taskId).toBe('task-123');
      expect(config.coverageThreshold).toBe(85);
      expect(config.repoPath).toBe('/test/repo');
    });

    it('should use default coverage threshold when not specified', async () => {
      process.env.ENVIRONMENT = 'test';
      process.env.BRANCH_NAME = 'feature-branch';
      process.env.SPEC_PATH = '.kiro/specs/feature-branch';

      const config = await loader.loadConfig('/test/repo');

      expect(config.coverageThreshold).toBe(80);
    });

    it('should throw error when required environment variable is missing', async () => {
      process.env.ENVIRONMENT = 'test';
      process.env.BRANCH_NAME = 'feature-branch';
      // SPEC_PATH is missing

      await expect(loader.loadConfig('/test/repo'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw error for invalid environment', async () => {
      process.env.ENVIRONMENT = 'invalid';
      process.env.BRANCH_NAME = 'feature-branch';
      process.env.SPEC_PATH = '.kiro/specs/feature-branch';

      await expect(loader.loadConfig('/test/repo'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('loadTestConfig', () => {
    it('should load test configuration with defaults', async () => {
      const config = await loader.loadTestConfig();

      expect(config.testCommand).toBe('npm test');
      expect(config.coverageCommand).toBe('npm run test:coverage');
      expect(config.coverageThreshold).toBe(80);
    });

    it('should load custom test commands from environment', async () => {
      process.env.TEST_COMMAND = 'yarn test';
      process.env.COVERAGE_COMMAND = 'yarn coverage';
      process.env.COVERAGE_THRESHOLD = '90';

      const config = await loader.loadTestConfig();

      expect(config.testCommand).toBe('yarn test');
      expect(config.coverageCommand).toBe('yarn coverage');
      expect(config.coverageThreshold).toBe(90);
    });
  });

  describe('loadEnvironmentConfig', () => {
    it('should load configuration from Parameter Store', async () => {
      const mockConfig = {
        apiUrl: 'https://api.test.example.com',
        timeout: '30000'
      };

      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {
          Value: JSON.stringify(mockConfig)
        }
      });

      const config = await loader.loadEnvironmentConfig('test', '/kiro-worker/config');

      expect(config).toEqual(mockConfig);
    });

    it('should throw error when parameter not found', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {}
      });

      await expect(loader.loadEnvironmentConfig('test', '/kiro-worker/config'))
        .rejects
        .toThrow();
    });

    it('should handle SSM errors', async () => {
      ssmMock.on(GetParameterCommand).rejects(new Error('Access denied'));

      await expect(loader.loadEnvironmentConfig('test', '/kiro-worker/config'))
        .rejects
        .toThrow('Access denied');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const config = {
        environment: 'test' as const,
        branchName: 'feature-branch',
        specPath: '.kiro/specs/feature-branch',
        coverageThreshold: 80,
        repoPath: '/test/repo'
      };

      expect(() => loader.validateConfig(config)).not.toThrow();
    });

    it('should throw error for missing environment', () => {
      const config = {
        environment: '' as any,
        branchName: 'feature-branch',
        specPath: '.kiro/specs/feature-branch',
        coverageThreshold: 80,
        repoPath: '/test/repo'
      };

      expect(() => loader.validateConfig(config)).toThrow(ValidationError);
    });

    it('should throw error for missing branch name', () => {
      const config = {
        environment: 'test' as const,
        branchName: '',
        specPath: '.kiro/specs/feature-branch',
        coverageThreshold: 80,
        repoPath: '/test/repo'
      };

      expect(() => loader.validateConfig(config)).toThrow(ValidationError);
    });

    it('should throw error for invalid coverage threshold', () => {
      const config = {
        environment: 'test' as const,
        branchName: 'feature-branch',
        specPath: '.kiro/specs/feature-branch',
        coverageThreshold: 150,
        repoPath: '/test/repo'
      };

      expect(() => loader.validateConfig(config)).toThrow(ValidationError);
    });

    it('should throw error for invalid environment value', () => {
      const config = {
        environment: 'development' as any,
        branchName: 'feature-branch',
        specPath: '.kiro/specs/feature-branch',
        coverageThreshold: 80,
        repoPath: '/test/repo'
      };

      expect(() => loader.validateConfig(config)).toThrow(ValidationError);
    });

    it('should collect multiple validation errors', () => {
      const config = {
        environment: '' as any,
        branchName: '',
        specPath: '',
        coverageThreshold: 150,
        repoPath: '/test/repo'
      };

      try {
        loader.validateConfig(config);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).validationErrors.length).toBeGreaterThan(1);
      }
    });
  });
});
