#!/usr/bin/env node
/**
 * CLI entry point for Kiro CodeBuild Worker
 * 
 * Reads configuration from environment variables, creates and executes KiroWorker,
 * and exits with appropriate status codes for CodeBuild integration.
 * 
 * Exit codes:
 * - 0: Success
 * - 1: Failure (validation, execution, or test errors)
 */

import { KiroWorker } from './index';
import { logger } from './utils/logger';
import { sanitizeForLogging } from './utils/sanitize';
import type { WorkerConfig } from './types';

/**
 * Load configuration from environment variables
 * 
 * @returns WorkerConfig object populated from environment
 * @throws Error if required environment variables are missing
 */
export function loadConfigFromEnvironment(): WorkerConfig {
  const requiredVars = ['BRANCH_NAME', 'SPEC_PATH', 'ENVIRONMENT'];
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  const config: WorkerConfig = {
    branchName: process.env.BRANCH_NAME!,
    specPath: process.env.SPEC_PATH!,
    environment: process.env.ENVIRONMENT as 'test' | 'staging' | 'production',
    repoPath: process.env.REPO_PATH || process.cwd(),
    targetBranch: process.env.TARGET_BRANCH || 'main',
    taskId: process.env.SPEC_TASK_ID,
    buildId: process.env.CODEBUILD_BUILD_ID || process.env.BUILD_ID,
    buildUrl: process.env.CODEBUILD_BUILD_URL || process.env.BUILD_URL,
    testCommand: process.env.TEST_COMMAND,
    coverageCommand: process.env.COVERAGE_COMMAND,
    coverageThreshold: process.env.COVERAGE_THRESHOLD 
      ? parseInt(process.env.COVERAGE_THRESHOLD, 10) 
      : 80,
    timeout: process.env.BUILD_TIMEOUT 
      ? parseInt(process.env.BUILD_TIMEOUT, 10) 
      : 3600000, // Default 60 minutes
    gitCredentialsSecretArn: process.env.GIT_CREDENTIALS_SECRET_ARN,
    apiTokenSecretArn: process.env.API_TOKEN_SECRET_ARN,
    githubToken: process.env.GITHUB_TOKEN,
    gitlabToken: process.env.GITLAB_TOKEN,
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
  };

  return config;
}

/**
 * Main CLI execution function
 * 
 * Loads configuration, creates KiroWorker, executes pipeline, and exits with appropriate code
 */
export async function main(): Promise<void> {
  let config: WorkerConfig;

  try {
    // Load configuration from environment
    logger.info('Loading configuration from environment variables');
    config = loadConfigFromEnvironment();

    logger.info('Configuration loaded successfully', {
      branchName: config.branchName,
      specPath: config.specPath,
      environment: config.environment,
      buildId: config.buildId,
      coverageThreshold: config.coverageThreshold
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedError = sanitizeForLogging(errorMessage);
    
    logger.error('Failed to load configuration', {
      error: sanitizedError
    });

    console.error(`ERROR: ${sanitizedError}`);
    console.error('\nRequired environment variables:');
    console.error('  - BRANCH_NAME: Feature branch to work on');
    console.error('  - SPEC_PATH: Path to spec folder (e.g., .kiro/specs/feature-name)');
    console.error('  - ENVIRONMENT: Deployment environment (test, staging, production)');
    console.error('\nOptional environment variables:');
    console.error('  - REPO_PATH: Repository path (default: current directory)');
    console.error('  - TARGET_BRANCH: Target branch for PR (default: main)');
    console.error('  - SPEC_TASK_ID: Specific task to execute');
    console.error('  - CODEBUILD_BUILD_ID: CodeBuild build ID');
    console.error('  - CODEBUILD_BUILD_URL: CodeBuild build URL');
    console.error('  - TEST_COMMAND: Custom test command (default: npm test)');
    console.error('  - COVERAGE_COMMAND: Custom coverage command (default: npm run test:coverage)');
    console.error('  - COVERAGE_THRESHOLD: Minimum coverage percentage (default: 80)');
    console.error('  - BUILD_TIMEOUT: Build timeout in milliseconds (default: 3600000)');
    console.error('  - GIT_CREDENTIALS_SECRET_ARN: AWS Secrets Manager ARN for Git credentials');
    console.error('  - API_TOKEN_SECRET_ARN: AWS Secrets Manager ARN for API token');
    console.error('  - GITHUB_TOKEN: GitHub API token (alternative to secret ARN)');
    console.error('  - GITLAB_TOKEN: GitLab API token (alternative to secret ARN)');
    console.error('  - AWS_REGION: AWS region (default: us-east-1)');

    process.exit(1);
  }

  try {
    // Create and execute KiroWorker
    logger.info('Creating Kiro Worker instance');
    const worker = new KiroWorker(config);

    logger.info('Starting Kiro Worker pipeline execution');
    const result = await worker.execute();

    // Log final result
    logger.info('Kiro Worker pipeline completed', {
      success: result.success,
      buildId: result.buildId,
      duration: result.duration,
      completedPhases: result.phases.filter(p => p.success).length,
      totalPhases: result.phases.length,
      prUrl: result.prUrl
    });

    // Print summary to console
    console.log('\n' + '='.repeat(80));
    console.log('KIRO WORKER PIPELINE COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log(`Build ID: ${result.buildId}`);
    console.log(`Environment: ${result.environment}`);
    console.log(`Branch: ${result.branchName}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`Completed Phases: ${result.phases.filter(p => p.success).length}/${result.phases.length}`);
    
    if (result.testResult) {
      console.log(`\nTest Results:`);
      console.log(`  Total Tests: ${result.testResult.totalTests}`);
      console.log(`  Passed: ${result.testResult.passedTests}`);
      console.log(`  Failed: ${result.testResult.failedTests}`);
    }

    if (result.coverageResult) {
      console.log(`\nCode Coverage: ${result.coverageResult.percentage.toFixed(2)}%`);
    }

    if (result.prUrl) {
      console.log(`\nPull Request: ${result.prUrl}`);
    }

    if (result.modifiedFiles && result.modifiedFiles.length > 0) {
      console.log(`\nModified Files: ${result.modifiedFiles.length}`);
    }

    console.log('='.repeat(80) + '\n');

    // Exit with success code
    process.exit(0);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedError = sanitizeForLogging(errorMessage);
    
    logger.error('Kiro Worker pipeline failed', {
      error: sanitizedError,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Print error summary to console
    console.error('\n' + '='.repeat(80));
    console.error('KIRO WORKER PIPELINE FAILED');
    console.error('='.repeat(80));
    console.error(`Error: ${sanitizedError}`);
    
    if (error instanceof Error && error.stack) {
      console.error('\nStack Trace:');
      console.error(error.stack);
    }
    
    console.error('='.repeat(80) + '\n');

    // Exit with failure code
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  const sanitizedError = sanitizeForLogging(errorMessage);
  
  logger.error('Unhandled promise rejection', {
    error: sanitizedError,
    promise: String(promise)
  });

  console.error(`\nFATAL ERROR: Unhandled promise rejection: ${sanitizedError}`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const sanitizedError = sanitizeForLogging(error.message);
  
  logger.error('Uncaught exception', {
    error: sanitizedError,
    stack: error.stack
  });

  console.error(`\nFATAL ERROR: Uncaught exception: ${sanitizedError}`);
  console.error(error.stack);
  process.exit(1);
});

// Execute main function only if this is the main module
// Note: When running via node, this file will execute main()
// When imported in tests, main() won't execute automatically
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((error) => {
    // Final catch for any unhandled errors
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
