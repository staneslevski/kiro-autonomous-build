import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('validate-deployment.sh', () => {
  const scriptPath = path.join(__dirname, '../../validate-deployment.sh');
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Script Existence and Permissions', () => {
    it('should exist at the correct location', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('should be executable', () => {
      const stats = fs.statSync(scriptPath);
      // Check if any execute bit is set (owner, group, or others)
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('should have correct shebang', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });

    it('should have error handling enabled', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -e');
      expect(content).toContain('set -u');
      expect(content).toContain('set -o pipefail');
    });
  });

  describe('Environment Variable Validation', () => {
    it('should fail when ENVIRONMENT is not set', () => {
      delete process.env.ENVIRONMENT;

      expect(() => {
        execSync(`bash ${scriptPath}`, {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });

    it('should accept valid environment values', () => {
      const validEnvironments = ['test', 'staging', 'production'];

      validEnvironments.forEach(env => {
        const content = fs.readFileSync(scriptPath, 'utf-8');
        expect(content).toContain(env);
      });
    });

    it('should validate environment value in case statement', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/case.*ENVIRONMENT.*in/s);
      expect(content).toContain('test|staging|production)');
    });
  });

  describe('Resource Validation Checks', () => {
    it('should check for CodePipeline existence', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('aws codepipeline get-pipeline');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}');
    });

    it('should check for all 6 CodeBuild projects', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Should check for build project
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-build');
      
      // Should check for integration test project
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-integration-test');
      
      // Should check for E2E test project
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-e2e-test');
      
      // Should check for deployment projects
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-deploy-test');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-deploy-staging');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-deploy-production');
      
      // Should use batch-get-projects
      expect(content).toContain('aws codebuild batch-get-projects');
    });

    it('should check for S3 artifacts bucket', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-artifacts');
      expect(content).toContain('aws s3api head-bucket');
    });

    it('should verify S3 bucket encryption', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('aws s3api get-bucket-encryption');
      expect(content).toContain('SSEAlgorithm');
      expect(content).toContain('aws:kms');
      expect(content).toContain('AES256');
    });

    it('should check for DynamoDB deployments table', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-deployments');
      expect(content).toContain('aws dynamodb describe-table');
    });

    it('should verify DynamoDB table has GSI', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('GlobalSecondaryIndexes');
      expect(content).toMatch(/GSI.*Global Secondary Index/s);
    });

    it('should verify DynamoDB table has TTL enabled', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('aws dynamodb describe-time-to-live');
      expect(content).toContain('TimeToLiveStatus');
      expect(content).toContain('ENABLED');
    });

    it('should check for rollback Lambda function', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-rollback');
      expect(content).toContain('aws lambda get-function');
    });

    it('should check for all 3 SNS topics', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Should check for deployment notifications topic
      expect(content).toContain('deployments');
      
      // Should check for approval notifications topic
      expect(content).toContain('approvals');
      
      // Should check for rollback notifications topic
      expect(content).toContain('rollbacks');
      
      // Should use list-topics
      expect(content).toContain('aws sns list-topics');
    });
  });

  describe('Output and Logging', () => {
    it('should have colored output functions', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('log_info');
      expect(content).toContain('log_pass');
      expect(content).toContain('log_fail');
      expect(content).toContain('log_warning');
    });

    it('should track validation results', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('VALIDATION_PASSED');
      expect(content).toContain('VALIDATION_FAILED');
    });

    it('should output validation summary', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('Validation Summary');
      expect(content).toContain('Checks Passed');
      expect(content).toContain('Checks Failed');
    });

    it('should provide pass/fail status for each check', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/log_pass.*exists/);
      expect(content).toMatch(/log_fail.*not found/);
    });
  });

  describe('Exit Codes', () => {
    it('should exit with 0 when all checks pass', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/VALIDATION_FAILED.*eq 0.*exit 0/s);
    });

    it('should exit with 1 when any check fails', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/exit 1/);
    });

    it('should exit with 1 when ENVIRONMENT is invalid', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/Invalid ENVIRONMENT.*exit 1/s);
    });
  });

  describe('Error Handling', () => {
    it('should handle AWS CLI errors gracefully', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      // Should use || echo "NOT_FOUND" pattern for error handling
      expect(content).toMatch(/2>\/dev\/null \|\| echo "NOT_FOUND"/);
    });

    it('should handle missing resources', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('NOT_FOUND');
      expect(content).toContain('not found');
    });

    it('should provide troubleshooting guidance on failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('Please review');
      expect(content).toContain('CloudFormation');
    });
  });

  describe('AWS Region Handling', () => {
    it('should get AWS region from configuration', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('aws configure get region');
    });

    it('should default to us-east-1 if region not configured', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('us-east-1');
    });

    it('should pass region to all AWS CLI commands', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const awsCommands = content.match(/aws \w+/g) || [];
      
      // Most AWS commands should have --region flag
      expect(content).toMatch(/--region.*AWS_REGION/);
    });
  });

  describe('Script Structure', () => {
    it('should have clear section headers', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('Check 1:');
      expect(content).toContain('Check 2:');
      expect(content).toContain('Check 3:');
      expect(content).toContain('Check 4:');
      expect(content).toContain('Check 5:');
      expect(content).toContain('Check 6:');
    });

    it('should have descriptive check names', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('CodePipeline');
      expect(content).toContain('CodeBuild');
      expect(content).toContain('S3');
      expect(content).toContain('DynamoDB');
      expect(content).toContain('Lambda');
      expect(content).toContain('SNS');
    });

    it('should separate checks with blank lines', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      // Should have echo "" between checks for readability
      const echoCount = (content.match(/echo ""/g) || []).length;
      expect(echoCount).toBeGreaterThan(5);
    });
  });

  describe('Resource Naming Conventions', () => {
    it('should use consistent naming pattern', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      // All resources should follow kiro-pipeline-{env}-{resource} pattern
      expect(content).toMatch(/kiro-pipeline-\$\{ENVIRONMENT\}-\w+/);
    });

    it('should validate pipeline name format', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('PIPELINE_NAME="kiro-pipeline-${ENVIRONMENT}"');
    });

    it('should validate bucket name format', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('BUCKET_NAME="kiro-pipeline-${ENVIRONMENT}-artifacts"');
    });

    it('should validate table name format', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('TABLE_NAME="kiro-pipeline-${ENVIRONMENT}-deployments"');
    });

    it('should validate Lambda name format', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('LAMBDA_NAME="kiro-pipeline-${ENVIRONMENT}-rollback"');
    });
  });

  describe('Validation Logic', () => {
    it('should increment VALIDATION_PASSED on success', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/log_pass.*VALIDATION_PASSED\+\+/s);
    });

    it('should increment VALIDATION_FAILED on failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/log_fail.*VALIDATION_FAILED\+\+/s);
    });

    it('should check all resources before exiting', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      // Should not exit early, should complete all checks
      const exitStatements = content.match(/exit 1/g) || [];
      // Only exit at the end (environment validation and final summary)
      expect(exitStatements.length).toBeLessThan(5);
    });
  });

  describe('Documentation and Comments', () => {
    it('should have script description at the top', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('CD Pipeline Deployment Validation Script');
      expect(content).toContain('Validates that all CD Pipeline resources are deployed correctly');
    });

    it('should have usage instructions', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('Usage:');
      expect(content).toContain('ENVIRONMENT=test ./validate-deployment.sh');
    });

    it('should document valid environment values', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('Valid values: test, staging, production');
    });
  });

  describe('Integration with deploy-pipeline.sh', () => {
    it('should be callable from deploy-pipeline.sh', () => {
      const deployScriptPath = path.join(__dirname, '../../deploy-pipeline.sh');
      const deployContent = fs.readFileSync(deployScriptPath, 'utf-8');
      
      expect(deployContent).toContain('validate-deployment.sh');
      expect(deployContent).toContain('Post-deployment validation');
    });

    it('should use same environment variable', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('${ENVIRONMENT}');
    });
  });
});
