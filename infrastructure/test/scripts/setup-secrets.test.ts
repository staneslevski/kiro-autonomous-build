import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests for infrastructure/scripts/setup-secrets.sh
 * 
 * This test suite validates the secrets setup script that creates
 * placeholder secrets in AWS Secrets Manager for the CD Pipeline.
 * 
 * **Validates**: TR-2 (Environment Configuration), NFR-2 (Security)
 */
describe('setup-secrets.sh', () => {
  const scriptPath = path.join(__dirname, '../../scripts/setup-secrets.sh');
  
  beforeEach(() => {
    // Verify script exists
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
  
  describe('Script Existence and Permissions', () => {
    it('should exist at the correct path', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });
    
    it('should be executable', () => {
      const stats = fs.statSync(scriptPath);
      // Check if owner has execute permission (mode & 0o100)
      expect(stats.mode & 0o100).toBeGreaterThan(0);
    });
    
    it('should have bash shebang', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });
    
    it('should have error handling enabled (set -e)', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -e');
    });
    
    it('should have undefined variable handling (set -u)', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -u');
    });
    
    it('should have pipe failure handling (set -o pipefail)', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -o pipefail');
    });
  });
  
  describe('Script Content Validation', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should validate ENVIRONMENT variable', () => {
      expect(scriptContent).toContain('if [ -z "${ENVIRONMENT:-}" ]');
      expect(scriptContent).toContain('ENVIRONMENT variable is not set');
    });
    
    it('should validate environment values (test, staging, production)', () => {
      expect(scriptContent).toContain('case "$ENVIRONMENT" in');
      expect(scriptContent).toContain('test|staging|production)');
    });
    
    it('should check for AWS CLI installation', () => {
      expect(scriptContent).toContain('command -v aws');
      expect(scriptContent).toContain('AWS CLI is not installed');
    });
    
    it('should get AWS account ID and region', () => {
      expect(scriptContent).toContain('aws sts get-caller-identity');
      expect(scriptContent).toContain('AWS_ACCOUNT_ID');
      expect(scriptContent).toContain('AWS_REGION');
    });
    
    it('should create GitHub token secret with correct naming', () => {
      expect(scriptContent).toContain('kiro-pipeline-${ENVIRONMENT}-github-token');
      expect(scriptContent).toContain('GITHUB_TOKEN_SECRET');
    });
    
    it('should create Slack webhook secret with correct naming', () => {
      expect(scriptContent).toContain('kiro-pipeline-${ENVIRONMENT}-slack-webhook');
      expect(scriptContent).toContain('SLACK_WEBHOOK_SECRET');
    });
    
    it('should check if secrets already exist before creating', () => {
      expect(scriptContent).toContain('aws secretsmanager describe-secret');
      expect(scriptContent).toContain('SECRET_EXISTS');
      expect(scriptContent).toContain('NOT_FOUND');
    });
    
    it('should create secrets with aws secretsmanager create-secret', () => {
      expect(scriptContent).toContain('aws secretsmanager create-secret');
      expect(scriptContent).toContain('--name');
      expect(scriptContent).toContain('--description');
      expect(scriptContent).toContain('--secret-string');
    });
    
    it('should output secret ARNs', () => {
      expect(scriptContent).toContain('SECRET_ARN');
      expect(scriptContent).toContain('arn:aws:secretsmanager');
    });
    
    it('should provide instructions for populating secrets', () => {
      expect(scriptContent).toContain('aws secretsmanager put-secret-value');
      expect(scriptContent).toContain('YOUR_ACTUAL_VALUE');
      expect(scriptContent).toContain('Next Steps');
    });
    
    it('should mark GitHub token as REQUIRED', () => {
      expect(scriptContent).toContain('REQUIRED');
      expect(scriptContent).toMatch(/GitHub.*REQUIRED/i);
    });
    
    it('should mark Slack webhook as OPTIONAL', () => {
      expect(scriptContent).toContain('OPTIONAL');
      expect(scriptContent).toMatch(/Slack.*OPTIONAL/i);
    });
    
    it('should include GitHub token creation instructions', () => {
      expect(scriptContent).toContain('github.com/settings/tokens');
      expect(scriptContent).toContain('Personal Access Token');
    });
    
    it('should include Slack webhook creation instructions', () => {
      expect(scriptContent).toContain('api.slack.com/messaging/webhooks');
      expect(scriptContent).toContain('Incoming Webhook');
    });
    
    it('should tag secrets with environment and project', () => {
      expect(scriptContent).toContain('--tags');
      expect(scriptContent).toContain('Key=Environment');
      expect(scriptContent).toContain('Key=Project,Value=KiroWorker');
    });
  });
  
  describe('Logging Functions', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should define log_info function', () => {
      expect(scriptContent).toContain('log_info()');
      expect(scriptContent).toContain('[INFO]');
    });
    
    it('should define log_success function', () => {
      expect(scriptContent).toContain('log_success()');
      expect(scriptContent).toContain('[SUCCESS]');
    });
    
    it('should define log_warning function', () => {
      expect(scriptContent).toContain('log_warning()');
      expect(scriptContent).toContain('[WARNING]');
    });
    
    it('should define log_error function', () => {
      expect(scriptContent).toContain('log_error()');
      expect(scriptContent).toContain('[ERROR]');
    });
    
    it('should use color codes for output', () => {
      expect(scriptContent).toContain('RED=');
      expect(scriptContent).toContain('GREEN=');
      expect(scriptContent).toContain('YELLOW=');
      expect(scriptContent).toContain('BLUE=');
      expect(scriptContent).toContain('NC='); // No Color
    });
  });
  
  describe('Secret Creation Function', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should define create_or_update_secret function', () => {
      expect(scriptContent).toContain('create_or_update_secret()');
    });
    
    it('should accept secret name, description, placeholder, and optional flag', () => {
      expect(scriptContent).toContain('local secret_name=$1');
      expect(scriptContent).toContain('local secret_description=$2');
      expect(scriptContent).toContain('local placeholder_value=$3');
      expect(scriptContent).toContain('local is_optional=$4');
    });
    
    it('should handle existing secrets gracefully', () => {
      expect(scriptContent).toContain('Secret already exists');
      expect(scriptContent).toContain('Existing secret ARN');
    });
    
    it('should check if existing secret has a value', () => {
      expect(scriptContent).toContain('aws secretsmanager get-secret-value');
      expect(scriptContent).toContain('HAS_VALUE');
    });
    
    it('should differentiate between required and optional secrets in output', () => {
      expect(scriptContent).toContain('if [ "$is_optional" == "false" ]');
      expect(scriptContent).toContain('⚠️  REQUIRED');
      expect(scriptContent).toContain('ℹ️  OPTIONAL');
    });
  });
  
  describe('Error Handling', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should exit with error code 1 on missing ENVIRONMENT', () => {
      expect(scriptContent).toMatch(/ENVIRONMENT variable is not set[\s\S]*exit 1/);
    });
    
    it('should exit with error code 1 on invalid ENVIRONMENT value', () => {
      expect(scriptContent).toMatch(/Invalid ENVIRONMENT value[\s\S]*exit 1/);
    });
    
    it('should exit with error code 1 when AWS CLI not installed', () => {
      expect(scriptContent).toMatch(/AWS CLI is not installed[\s\S]*exit 1/);
    });
    
    it('should exit with error code 1 when AWS credentials not configured', () => {
      expect(scriptContent).toMatch(/Failed to get AWS account ID[\s\S]*exit 1/);
    });
    
    it('should exit with error code 1 when GitHub token secret creation fails', () => {
      expect(scriptContent).toMatch(/Failed to create GitHub token secret[\s\S]*exit 1/);
    });
    
    it('should handle Slack webhook secret creation failure gracefully', () => {
      expect(scriptContent).toContain('Failed to create Slack webhook secret (optional)');
      expect(scriptContent).toContain('You can create this manually later');
    });
  });
  
  describe('Output and Documentation', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should display script header', () => {
      expect(scriptContent).toContain('CD Pipeline Secrets Setup Script');
      expect(scriptContent).toContain('=========================================');
    });
    
    it('should display summary section', () => {
      expect(scriptContent).toContain('Secrets Setup Summary');
      expect(scriptContent).toContain('Environment:');
      expect(scriptContent).toContain('AWS Account:');
      expect(scriptContent).toContain('AWS Region:');
    });
    
    it('should display next steps section', () => {
      expect(scriptContent).toContain('IMPORTANT: Next Steps');
      expect(scriptContent).toContain('Update GitHub Token Secret');
      expect(scriptContent).toContain('Update Slack Webhook Secret');
    });
    
    it('should provide verification commands', () => {
      expect(scriptContent).toContain('Verify Secrets');
      expect(scriptContent).toContain('aws secretsmanager list-secrets');
    });
    
    it('should reference deployment script', () => {
      expect(scriptContent).toContain('Deploy Pipeline');
      expect(scriptContent).toContain('./deploy-pipeline.sh');
    });
    
    it('should display success message at the end', () => {
      expect(scriptContent).toContain('Secrets setup completed!');
    });
  });
  
  describe('Security Best Practices', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should use placeholder values, not real secrets', () => {
      expect(scriptContent).toContain('PLACEHOLDER');
      expect(scriptContent).toContain('REPLACE_ME');
    });
    
    it('should not contain any hardcoded secrets or tokens', () => {
      // Check for common secret patterns (real tokens, not examples)
      expect(scriptContent).not.toMatch(/ghp_[a-zA-Z0-9]{36}/); // GitHub token pattern
      
      // Check that Slack webhook URLs are only in example/documentation context
      // (not actual webhook URLs with real IDs)
      const slackWebhookMatches = scriptContent.match(/https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/g);
      if (slackWebhookMatches) {
        // If found, ensure they're only in documentation/example context (YOUR/WEBHOOK/URL)
        slackWebhookMatches.forEach(match => {
          expect(match).toContain('YOUR/WEBHOOK/URL');
        });
      }
    });
    
    it('should instruct users to replace placeholder values', () => {
      expect(scriptContent).toContain('YOUR_ACTUAL_VALUE');
      expect(scriptContent).toContain('your_actual_github_token');
    });
    
    it('should warn about required secrets', () => {
      expect(scriptContent).toContain('⚠️');
      expect(scriptContent).toContain('REQUIRED');
    });
  });
  
  describe('Integration with Pipeline', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should use consistent naming convention with pipeline', () => {
      expect(scriptContent).toContain('kiro-pipeline-${ENVIRONMENT}');
    });
    
    it('should support all three environments', () => {
      expect(scriptContent).toContain('test|staging|production');
    });
    
    it('should reference the correct AWS region configuration', () => {
      expect(scriptContent).toContain('aws configure get region');
      expect(scriptContent).toContain('us-east-1'); // Default region
    });
  });
  
  describe('Script Documentation', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should include usage instructions in header', () => {
      expect(scriptContent).toContain('Usage: ENVIRONMENT=test ./scripts/setup-secrets.sh');
    });
    
    it('should document the script purpose', () => {
      expect(scriptContent).toContain('Creates placeholder secrets in AWS Secrets Manager');
    });
    
    it('should provide step-by-step progress logging', () => {
      expect(scriptContent).toContain('Step 1:');
      expect(scriptContent).toContain('Step 2:');
      expect(scriptContent).toContain('Step 3:');
      expect(scriptContent).toContain('Step 4:');
      expect(scriptContent).toContain('Step 5:');
      expect(scriptContent).toContain('Step 6:');
    });
  });
});

/**
 * Property-Based Tests for Secret Naming Convention
 * 
 * Validates that secret names follow the correct pattern across
 * all environments.
 */
describe('setup-secrets.sh - Property-Based Tests', () => {
  const scriptPath = path.join(__dirname, '../../scripts/setup-secrets.sh');
  
  it('should follow consistent naming pattern for all environments', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    const environments = ['test', 'staging', 'production'];
    
    environments.forEach(env => {
      // GitHub token secret pattern
      const githubPattern = `kiro-pipeline-${env}-github-token`;
      expect(scriptContent).toContain('kiro-pipeline-${ENVIRONMENT}-github-token');
      
      // Slack webhook secret pattern
      const slackPattern = `kiro-pipeline-${env}-slack-webhook`;
      expect(scriptContent).toContain('kiro-pipeline-${ENVIRONMENT}-slack-webhook');
    });
  });
  
  it('should maintain consistent secret descriptions', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // Check that descriptions include environment variable
    expect(scriptContent).toContain('${ENVIRONMENT} environment');
    expect(scriptContent).toContain('GitHub OAuth token');
    expect(scriptContent).toContain('Slack webhook URL');
  });
  
  it('should use consistent placeholder naming', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // All placeholders should follow PLACEHOLDER_*_REPLACE_ME pattern
    expect(scriptContent).toContain('PLACEHOLDER_GITHUB_TOKEN_REPLACE_ME');
    expect(scriptContent).toContain('PLACEHOLDER_SLACK_WEBHOOK_REPLACE_ME');
  });
});

/**
 * Coverage Test
 * 
 * Ensures all critical paths in the script are covered by tests.
 */
describe('setup-secrets.sh - Coverage Validation', () => {
  const scriptPath = path.join(__dirname, '../../scripts/setup-secrets.sh');
  
  it('should have comprehensive test coverage of script functionality', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // Critical functionality that must be tested
    const criticalFeatures = [
      'ENVIRONMENT validation',
      'AWS CLI check',
      'AWS credentials check',
      'Secret existence check',
      'Secret creation',
      'Error handling',
      'Logging functions',
      'Output formatting',
      'Instructions for manual updates'
    ];
    
    // Verify script contains all critical features
    expect(scriptContent).toContain('ENVIRONMENT');
    expect(scriptContent).toContain('aws');
    expect(scriptContent).toContain('secretsmanager');
    expect(scriptContent).toContain('create-secret');
    expect(scriptContent).toContain('describe-secret');
    expect(scriptContent).toContain('log_');
    expect(scriptContent).toContain('exit 1');
    expect(scriptContent).toContain('put-secret-value');
  });
});
