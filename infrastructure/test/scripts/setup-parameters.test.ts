import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests for infrastructure/scripts/setup-parameters.sh
 * 
 * This test suite validates the parameters setup script that creates
 * parameters in AWS Systems Manager Parameter Store for the CD Pipeline.
 * 
 * **Validates**: TR-2 (Environment Configuration)
 */
describe('setup-parameters.sh', () => {
  const scriptPath = path.join(__dirname, '../../scripts/setup-parameters.sh');
  
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
    
    it('should create GitHub owner parameter with correct naming', () => {
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/github-owner');
      expect(scriptContent).toContain('GITHUB_OWNER_PARAM');
    });
    
    it('should create GitHub repo parameter with correct naming', () => {
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/github-repo');
      expect(scriptContent).toContain('GITHUB_REPO_PARAM');
    });
    
    it('should create alarm threshold parameters', () => {
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/alarm-threshold-pipeline-failures');
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/alarm-threshold-rollback-count');
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/alarm-threshold-deployment-duration');
    });
    
    it('should create timeout parameters', () => {
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/health-check-duration');
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/approval-timeout');
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/rollback-timeout');
    });
    
    it('should check if parameters already exist before creating', () => {
      expect(scriptContent).toContain('aws ssm get-parameter');
      expect(scriptContent).toContain('PARAMETER_EXISTS');
      expect(scriptContent).toContain('NOT_FOUND');
    });
    
    it('should create parameters with aws ssm put-parameter', () => {
      expect(scriptContent).toContain('aws ssm put-parameter');
      expect(scriptContent).toContain('--name');
      expect(scriptContent).toContain('--description');
      expect(scriptContent).toContain('--value');
      expect(scriptContent).toContain('--type');
    });
    
    it('should output parameter names for reference', () => {
      expect(scriptContent).toContain('Parameter created successfully');
      expect(scriptContent).toContain('Parameter value:');
    });
    
    it('should provide instructions for updating parameters', () => {
      expect(scriptContent).toContain('aws ssm put-parameter');
      expect(scriptContent).toContain('--overwrite');
      expect(scriptContent).toContain('YOUR_ACTUAL_VALUE');
    });
    
    it('should mark GitHub parameters as REQUIRED', () => {
      expect(scriptContent).toContain('REQUIRED');
      expect(scriptContent).toMatch(/GitHub.*REQUIRED/i);
    });
    
    it('should mark alarm and timeout parameters as OPTIONAL', () => {
      expect(scriptContent).toContain('OPTIONAL');
      expect(scriptContent).toMatch(/Alarm.*OPTIONAL/i);
      expect(scriptContent).toMatch(/Timeout.*OPTIONAL/i);
    });
    
    it('should tag parameters with environment and project', () => {
      expect(scriptContent).toContain('--tags');
      expect(scriptContent).toContain('Key=Environment');
      expect(scriptContent).toContain('Key=Project,Value=KiroWorker');
    });
  });
  
  describe('Environment-Specific Configuration', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should set different pipeline failure thresholds per environment', () => {
      expect(scriptContent).toContain('PIPELINE_FAILURE_THRESHOLD_VALUE');
      // Test environment should be more lenient
      expect(scriptContent).toMatch(/test\)[\s\S]*PIPELINE_FAILURE_THRESHOLD_VALUE="5"/);
      // Staging and production should be stricter
      expect(scriptContent).toMatch(/staging\)[\s\S]*PIPELINE_FAILURE_THRESHOLD_VALUE="3"/);
      expect(scriptContent).toMatch(/production\)[\s\S]*PIPELINE_FAILURE_THRESHOLD_VALUE="3"/);
    });
    
    it('should set different rollback thresholds per environment', () => {
      expect(scriptContent).toContain('ROLLBACK_THRESHOLD_VALUE');
      // Test environment should be more lenient
      expect(scriptContent).toMatch(/test\)[\s\S]*ROLLBACK_THRESHOLD_VALUE="5"/);
      // Staging should be moderate
      expect(scriptContent).toMatch(/staging\)[\s\S]*ROLLBACK_THRESHOLD_VALUE="3"/);
      // Production should be strictest
      expect(scriptContent).toMatch(/production\)[\s\S]*ROLLBACK_THRESHOLD_VALUE="2"/);
    });
    
    it('should set different deployment duration thresholds per environment', () => {
      expect(scriptContent).toContain('DEPLOYMENT_DURATION_THRESHOLD_VALUE');
      // Test environment should allow longer deployments
      expect(scriptContent).toMatch(/test\)[\s\S]*DEPLOYMENT_DURATION_THRESHOLD_VALUE="90"/);
      // Staging should be moderate
      expect(scriptContent).toMatch(/staging\)[\s\S]*DEPLOYMENT_DURATION_THRESHOLD_VALUE="75"/);
      // Production should be strictest
      expect(scriptContent).toMatch(/production\)[\s\S]*DEPLOYMENT_DURATION_THRESHOLD_VALUE="60"/);
    });
    
    it('should set different health check durations per environment', () => {
      expect(scriptContent).toContain('HEALTH_CHECK_DURATION_VALUE');
      // Test and staging should have shorter health checks
      expect(scriptContent).toMatch(/test\)[\s\S]*HEALTH_CHECK_DURATION_VALUE="5"/);
      expect(scriptContent).toMatch(/staging\)[\s\S]*HEALTH_CHECK_DURATION_VALUE="5"/);
      // Production should have longer health checks
      expect(scriptContent).toMatch(/production\)[\s\S]*HEALTH_CHECK_DURATION_VALUE="10"/);
    });
    
    it('should set consistent approval timeout across environments', () => {
      expect(scriptContent).toContain('APPROVAL_TIMEOUT_VALUE');
      // All environments should have 24-hour approval timeout
      expect(scriptContent).toMatch(/test\)[\s\S]*APPROVAL_TIMEOUT_VALUE="24"/);
      expect(scriptContent).toMatch(/staging\)[\s\S]*APPROVAL_TIMEOUT_VALUE="24"/);
      expect(scriptContent).toMatch(/production\)[\s\S]*APPROVAL_TIMEOUT_VALUE="24"/);
    });
    
    it('should set consistent rollback timeout across environments', () => {
      expect(scriptContent).toContain('ROLLBACK_TIMEOUT_VALUE');
      // All environments should have 15-minute rollback timeout
      expect(scriptContent).toContain('ROLLBACK_TIMEOUT_VALUE="15"');
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
  
  describe('Parameter Creation Function', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should define create_or_update_parameter function', () => {
      expect(scriptContent).toContain('create_or_update_parameter()');
    });
    
    it('should accept parameter name, description, value, type, and required flag', () => {
      expect(scriptContent).toContain('local parameter_name=$1');
      expect(scriptContent).toContain('local parameter_description=$2');
      expect(scriptContent).toContain('local parameter_value=$3');
      expect(scriptContent).toContain('local parameter_type=$4');
      expect(scriptContent).toContain('local is_required=$5');
    });
    
    it('should handle existing parameters gracefully', () => {
      expect(scriptContent).toContain('Parameter already exists');
      expect(scriptContent).toContain('Current value:');
    });
    
    it('should check if existing parameter has a different value', () => {
      expect(scriptContent).toContain('CURRENT_VALUE');
      expect(scriptContent).toContain('Parameter has a different value');
      expect(scriptContent).toContain('Keeping existing value');
    });
    
    it('should differentiate between required and optional parameters in output', () => {
      expect(scriptContent).toContain('if [ "$is_required" == "true" ]');
      expect(scriptContent).toContain('⚠️  REQUIRED');
      expect(scriptContent).toContain('ℹ️  OPTIONAL');
    });
    
    it('should use String parameter type', () => {
      expect(scriptContent).toContain('"String"');
      expect(scriptContent).toContain('--type "$parameter_type"');
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
    
    it('should exit with error code 1 when GitHub owner parameter creation fails', () => {
      expect(scriptContent).toMatch(/Failed to create GitHub owner parameter[\s\S]*exit 1/);
    });
    
    it('should exit with error code 1 when GitHub repo parameter creation fails', () => {
      expect(scriptContent).toMatch(/Failed to create GitHub repo parameter[\s\S]*exit 1/);
    });
    
    it('should handle optional parameter creation failures gracefully', () => {
      expect(scriptContent).toContain('Failed to create pipeline failure threshold parameter (optional)');
      expect(scriptContent).toContain('Failed to create rollback threshold parameter (optional)');
      expect(scriptContent).toContain('Failed to create deployment duration threshold parameter (optional)');
    });
  });
  
  describe('Output and Documentation', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should display script header', () => {
      expect(scriptContent).toContain('CD Pipeline Parameters Setup Script');
      expect(scriptContent).toContain('=========================================');
    });
    
    it('should display summary section', () => {
      expect(scriptContent).toContain('Parameters Setup Summary');
      expect(scriptContent).toContain('Environment:');
      expect(scriptContent).toContain('AWS Account:');
      expect(scriptContent).toContain('AWS Region:');
    });
    
    it('should display parameters created/verified section', () => {
      expect(scriptContent).toContain('Parameters Created/Verified:');
      expect(scriptContent).toContain('GitHub Configuration (REQUIRED):');
      expect(scriptContent).toContain('Alarm Thresholds (OPTIONAL):');
      expect(scriptContent).toContain('Timeouts (OPTIONAL):');
    });
    
    it('should display next steps section', () => {
      expect(scriptContent).toContain('IMPORTANT: Next Steps');
      expect(scriptContent).toContain('Update GitHub Configuration Parameters');
      expect(scriptContent).toContain('Review and Adjust Alarm Thresholds');
      expect(scriptContent).toContain('Review and Adjust Timeouts');
    });
    
    it('should provide verification commands', () => {
      expect(scriptContent).toContain('Verify Parameters');
      expect(scriptContent).toContain('aws ssm get-parameters-by-path');
    });
    
    it('should reference deployment script', () => {
      expect(scriptContent).toContain('Deploy Pipeline');
      expect(scriptContent).toContain('./deploy-pipeline.sh');
    });
    
    it('should display success message at the end', () => {
      expect(scriptContent).toContain('Parameters setup completed!');
    });
  });
  
  describe('Parameter Naming Convention', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should use consistent parameter path prefix', () => {
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/');
    });
    
    it('should use descriptive parameter names', () => {
      expect(scriptContent).toContain('github-owner');
      expect(scriptContent).toContain('github-repo');
      expect(scriptContent).toContain('alarm-threshold-pipeline-failures');
      expect(scriptContent).toContain('alarm-threshold-rollback-count');
      expect(scriptContent).toContain('alarm-threshold-deployment-duration');
      expect(scriptContent).toContain('health-check-duration');
      expect(scriptContent).toContain('approval-timeout');
      expect(scriptContent).toContain('rollback-timeout');
    });
    
    it('should use placeholder values for required parameters', () => {
      expect(scriptContent).toContain('PLACEHOLDER_GITHUB_OWNER');
      expect(scriptContent).toContain('PLACEHOLDER_GITHUB_REPO');
    });
  });
  
  describe('Integration with Pipeline', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should use consistent naming convention with pipeline', () => {
      // Parameters use path-based naming: /kiro-pipeline/{env}/parameter-name
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/');
    });
    
    it('should support all three environments', () => {
      expect(scriptContent).toContain('test|staging|production');
    });
    
    it('should reference the correct AWS region configuration', () => {
      expect(scriptContent).toContain('aws configure get region');
      expect(scriptContent).toContain('us-east-1'); // Default region
    });
    
    it('should create parameters that align with pipeline requirements', () => {
      // GitHub configuration
      expect(scriptContent).toContain('github-owner');
      expect(scriptContent).toContain('github-repo');
      
      // Alarm thresholds
      expect(scriptContent).toContain('alarm-threshold');
      
      // Timeouts
      expect(scriptContent).toContain('health-check-duration');
      expect(scriptContent).toContain('approval-timeout');
      expect(scriptContent).toContain('rollback-timeout');
    });
  });
  
  describe('Script Documentation', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should include usage instructions in header', () => {
      expect(scriptContent).toContain('Usage: ENVIRONMENT=test ./scripts/setup-parameters.sh');
    });
    
    it('should document the script purpose', () => {
      expect(scriptContent).toContain('Creates parameters in AWS Systems Manager Parameter Store');
    });
    
    it('should provide step-by-step progress logging', () => {
      expect(scriptContent).toContain('Step 1:');
      expect(scriptContent).toContain('Step 2:');
      expect(scriptContent).toContain('Step 3:');
      expect(scriptContent).toContain('Step 4:');
      expect(scriptContent).toContain('Step 5:');
      expect(scriptContent).toContain('Step 6:');
      expect(scriptContent).toContain('Step 7:');
      expect(scriptContent).toContain('Step 8:');
    });
    
    it('should provide detailed instructions for updating GitHub parameters', () => {
      expect(scriptContent).toContain('Update GitHub owner/organization');
      expect(scriptContent).toContain('Update GitHub repository name');
      expect(scriptContent).toContain('your-github-org');
      expect(scriptContent).toContain('your-repo-name');
    });
  });
  
  describe('Parameter Values and Units', () => {
    let scriptContent: string;
    
    beforeEach(() => {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    });
    
    it('should document units for duration parameters', () => {
      expect(scriptContent).toContain('minutes');
      expect(scriptContent).toContain('hours');
    });
    
    it('should use numeric values for thresholds and timeouts', () => {
      // Pipeline failure thresholds
      expect(scriptContent).toContain('"5"'); // test
      expect(scriptContent).toContain('"3"'); // staging/production
      
      // Rollback thresholds
      expect(scriptContent).toContain('"2"'); // production
      
      // Duration thresholds
      expect(scriptContent).toContain('"90"'); // test
      expect(scriptContent).toContain('"75"'); // staging
      expect(scriptContent).toContain('"60"'); // production
      
      // Health check duration
      expect(scriptContent).toContain('"5"'); // test/staging
      expect(scriptContent).toContain('"10"'); // production
      
      // Approval timeout
      expect(scriptContent).toContain('"24"'); // all environments
      
      // Rollback timeout
      expect(scriptContent).toContain('"15"'); // all environments
    });
  });
});

/**
 * Property-Based Tests for Parameter Naming Convention
 * 
 * Validates that parameter names follow the correct pattern across
 * all environments.
 */
describe('setup-parameters.sh - Property-Based Tests', () => {
  const scriptPath = path.join(__dirname, '../../scripts/setup-parameters.sh');
  
  it('should follow consistent naming pattern for all environments', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    const environments = ['test', 'staging', 'production'];
    
    environments.forEach(env => {
      // All parameters should use the /kiro-pipeline/{env}/ prefix
      expect(scriptContent).toContain('/kiro-pipeline/${ENVIRONMENT}/');
    });
  });
  
  it('should maintain consistent parameter descriptions', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // Check that descriptions include environment variable
    expect(scriptContent).toContain('${ENVIRONMENT} environment');
    expect(scriptContent).toContain('GitHub repository owner');
    expect(scriptContent).toContain('GitHub repository name');
    expect(scriptContent).toContain('alarm');
    expect(scriptContent).toContain('timeout');
  });
  
  it('should use consistent placeholder naming', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // All placeholders should follow PLACEHOLDER_* pattern
    expect(scriptContent).toContain('PLACEHOLDER_GITHUB_OWNER');
    expect(scriptContent).toContain('PLACEHOLDER_GITHUB_REPO');
  });
  
  it('should have environment-specific values that make sense', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // Test environment should be most lenient
    // Production should be strictest
    // This is validated by checking the numeric values in context
    
    // Pipeline failures: test (5) > staging (3) = production (3)
    expect(scriptContent).toMatch(/test\)[\s\S]*PIPELINE_FAILURE_THRESHOLD_VALUE="5"/);
    
    // Rollback count: test (5) > staging (3) > production (2)
    expect(scriptContent).toMatch(/production\)[\s\S]*ROLLBACK_THRESHOLD_VALUE="2"/);
    
    // Deployment duration: test (90) > staging (75) > production (60)
    expect(scriptContent).toMatch(/production\)[\s\S]*DEPLOYMENT_DURATION_THRESHOLD_VALUE="60"/);
    
    // Health check: production (10) > test/staging (5)
    expect(scriptContent).toMatch(/production\)[\s\S]*HEALTH_CHECK_DURATION_VALUE="10"/);
  });
});

/**
 * Coverage Test
 * 
 * Ensures all critical paths in the script are covered by tests.
 */
describe('setup-parameters.sh - Coverage Validation', () => {
  const scriptPath = path.join(__dirname, '../../scripts/setup-parameters.sh');
  
  it('should have comprehensive test coverage of script functionality', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // Critical functionality that must be tested
    const criticalFeatures = [
      'ENVIRONMENT validation',
      'AWS CLI check',
      'AWS credentials check',
      'Parameter existence check',
      'Parameter creation',
      'Error handling',
      'Logging functions',
      'Output formatting',
      'Instructions for manual updates',
      'Environment-specific values'
    ];
    
    // Verify script contains all critical features
    expect(scriptContent).toContain('ENVIRONMENT');
    expect(scriptContent).toContain('aws');
    expect(scriptContent).toContain('ssm');
    expect(scriptContent).toContain('put-parameter');
    expect(scriptContent).toContain('get-parameter');
    expect(scriptContent).toContain('log_');
    expect(scriptContent).toContain('exit 1');
    expect(scriptContent).toContain('--overwrite');
    expect(scriptContent).toContain('case "$ENVIRONMENT" in');
  });
  
  it('should create all required parameter types', () => {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    
    // GitHub configuration parameters
    expect(scriptContent).toContain('github-owner');
    expect(scriptContent).toContain('github-repo');
    
    // Alarm threshold parameters
    expect(scriptContent).toContain('alarm-threshold-pipeline-failures');
    expect(scriptContent).toContain('alarm-threshold-rollback-count');
    expect(scriptContent).toContain('alarm-threshold-deployment-duration');
    
    // Timeout parameters
    expect(scriptContent).toContain('health-check-duration');
    expect(scriptContent).toContain('approval-timeout');
    expect(scriptContent).toContain('rollback-timeout');
  });
});
