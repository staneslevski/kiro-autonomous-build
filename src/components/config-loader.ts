/**
 * Configuration Loader - Loads and validates configuration from various sources
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ValidationError } from '../errors';
import { WorkerConfig, TestConfig } from '../types';
import { logger } from '../utils/logger';

export interface BuildSpecConfig {
  readonly environment: string;
  readonly branchName: string;
  readonly specPath: string;
  readonly taskId?: string;
  readonly coverageThreshold: number;
  readonly testCommand?: string;
  readonly coverageCommand?: string;
}

export class ConfigLoader {
  private readonly ssmClient: SSMClient;
  private readonly region: string;

  constructor(region: string = 'us-east-1') {
    this.region = region;
    this.ssmClient = new SSMClient({ region });
  }

  /**
   * Load configuration from environment variables and buildspec.yml
   */
  async loadConfig(repoPath: string): Promise<WorkerConfig> {
    logger.info('Loading configuration', { repoPath });

    try {
      // Load from environment variables
      const environment = this.getRequiredEnv('ENVIRONMENT');
      const branchName = this.getRequiredEnv('BRANCH_NAME');
      const specPath = this.getRequiredEnv('SPEC_PATH');
      const taskId = process.env.SPEC_TASK_ID;
      const coverageThreshold = parseInt(process.env.COVERAGE_THRESHOLD || '80', 10);

      // Validate environment
      this.validateEnvironment(environment);

      const config: WorkerConfig = {
        environment: environment as 'test' | 'staging' | 'production',
        branchName,
        specPath,
        taskId,
        coverageThreshold,
        repoPath
      };

      logger.info('Configuration loaded successfully', { 
        environment, 
        branchName, 
        coverageThreshold 
      });

      return config;
    } catch (error) {
      const configError = new ValidationError(
        'Failed to load configuration',
        [error instanceof Error ? error.message : String(error)],
        error instanceof Error ? error : undefined
      );
      logger.error('Configuration loading failed', configError);
      throw configError;
    }
  }

  /**
   * Load test configuration
   */
  async loadTestConfig(): Promise<TestConfig> {
    const testCommand = process.env.TEST_COMMAND || 'npm test';
    const coverageCommand = process.env.COVERAGE_COMMAND || 'npm run test:coverage';
    const coverageThreshold = parseInt(process.env.COVERAGE_THRESHOLD || '80', 10);

    return {
      testCommand,
      coverageCommand,
      coverageThreshold
    };
  }

  /**
   * Load environment-specific configuration from Parameter Store
   */
  async loadEnvironmentConfig(environment: string, parameterPath: string): Promise<Record<string, string>> {
    logger.info('Loading environment-specific configuration', { environment, parameterPath });

    try {
      const fullPath = `${parameterPath}/${environment}`;
      
      const command = new GetParameterCommand({
        Name: fullPath,
        WithDecryption: true
      });

      const response = await this.ssmClient.send(command);
      
      if (!response.Parameter?.Value) {
        throw new Error(`Parameter ${fullPath} not found or empty`);
      }

      const config = JSON.parse(response.Parameter.Value);
      
      logger.info('Environment configuration loaded', { environment });
      
      return config;
    } catch (error) {
      logger.error('Failed to load environment configuration', error, { environment });
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: WorkerConfig): void {
    const errors: string[] = [];

    if (!config.environment) {
      errors.push('ENVIRONMENT is required');
    }

    if (!config.branchName) {
      errors.push('BRANCH_NAME is required');
    }

    if (!config.specPath) {
      errors.push('SPEC_PATH is required');
    }

    if (config.coverageThreshold < 0 || config.coverageThreshold > 100) {
      errors.push('COVERAGE_THRESHOLD must be between 0 and 100');
    }

    if (!['test', 'staging', 'production'].includes(config.environment)) {
      errors.push('ENVIRONMENT must be one of: test, staging, production');
    }

    if (errors.length > 0) {
      throw new ValidationError('Configuration validation failed', errors);
    }

    logger.info('Configuration validated successfully');
  }

  /**
   * Get required environment variable
   */
  private getRequiredEnv(name: string): string {
    const value = process.env[name];
    
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }

    return value;
  }

  /**
   * Validate environment value
   */
  private validateEnvironment(environment: string): void {
    const validEnvironments = ['test', 'staging', 'production'];
    
    if (!validEnvironments.includes(environment)) {
      throw new Error(
        `Invalid environment: ${environment}. Must be one of: ${validEnvironments.join(', ')}`
      );
    }
  }
}
