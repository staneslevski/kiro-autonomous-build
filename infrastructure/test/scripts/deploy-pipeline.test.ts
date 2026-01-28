import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests for deploy-pipeline.sh script
 * 
 * These tests verify the deployment script's behavior including:
 * - Environment validation
 * - Prerequisite checks (AWS CLI, CDK CLI)
 * - Bootstrap verification
 * - Sequential stack deployment
 * - Error handling and rollback instructions
 */
describe('deploy-pipeline.sh', () => {
  const scriptPath = path.join(__dirname, '../../deploy-pipeline.sh');
  
  beforeEach(() => {
    // Verify script exists
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
  
  describe('Script Structure', () => {
    it('should have correct shebang', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });
    
    it('should have set -e for error handling', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -e');
    });
    
    it('should have set -u for undefined variable handling', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -u');
    });
    
    it('should have set -o pipefail for pipe failure handling', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('set -o pipefail');
    });
    
    it('should be executable', () => {
      const stats = fs.statSync(scriptPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });
  });
  
  describe('Environment Validation', () => {
    it('should validate ENVIRONMENT variable is set', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for environment validation logic
      expect(content).toContain('if [ -z "${ENVIRONMENT:-}" ]');
      expect(content).toContain('ENVIRONMENT variable is not set');
    });
    
    it('should validate ENVIRONMENT value is test, staging, or production', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for case statement validating environment values
      expect(content).toContain('case "$ENVIRONMENT" in');
      expect(content).toContain('test|staging|production)');
    });
    
    it('should reject invalid ENVIRONMENT values', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for error handling of invalid environment
      expect(content).toContain('Invalid ENVIRONMENT value');
      expect(content).toContain('Valid values: test, staging, production');
    });
  });
  
  describe('Prerequisite Checks', () => {
    it('should check for AWS CLI installation', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('command -v aws');
      expect(content).toContain('AWS CLI is not installed');
    });
    
    it('should check for CDK CLI installation', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('command -v cdk');
      expect(content).toContain('AWS CDK CLI is not installed');
    });
    
    it('should get AWS account ID', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('aws sts get-caller-identity');
      expect(content).toContain('AWS_ACCOUNT_ID');
    });
    
    it('should get AWS region', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('aws configure get region');
      expect(content).toContain('AWS_REGION');
    });
  });
  
  describe('CDK Bootstrap Check', () => {
    it('should check for CDK bootstrap stack', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('CDKToolkit');
      expect(content).toContain('aws cloudformation describe-stacks');
    });
    
    it('should bootstrap CDK if not already bootstrapped', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('cdk bootstrap');
      expect(content).toContain('CDK bootstrap completed successfully');
    });
    
    it('should skip bootstrap if already bootstrapped', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('CDK is already bootstrapped');
    });
  });
  
  describe('Dependency Installation', () => {
    it('should install npm dependencies', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('npm install');
      expect(content).toContain('Dependencies installed');
    });
    
    it('should skip installation if node_modules exists', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('if [ ! -d "node_modules" ]');
      expect(content).toContain('Dependencies already installed');
    });
  });
  
  describe('Build Process', () => {
    it('should build TypeScript code', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('npm run build');
      expect(content).toContain('TypeScript build completed');
    });
    
    it('should exit on build failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for error handling after build
      const buildSection = content.match(/npm run build.*?exit 1/s);
      expect(buildSection).toBeTruthy();
    });
  });
  
  describe('CDK Synthesis', () => {
    it('should synthesize CDK stacks', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('cdk synth --all');
      expect(content).toContain('--context environment=$ENVIRONMENT');
    });
    
    it('should exit on synthesis failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for error handling after synth
      const synthSection = content.match(/cdk synth.*?exit 1/s);
      expect(synthSection).toBeTruthy();
    });
  });
  
  describe('Sequential Stack Deployment', () => {
    it('should define core stack name', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('CORE_STACK="kiro-pipeline-${ENVIRONMENT}-core"');
    });
    
    it('should define pipeline stack name', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('PIPELINE_STACK="kiro-pipeline-${ENVIRONMENT}"');
    });
    
    it('should define monitoring stack name', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('MONITORING_STACK="kiro-worker-${ENVIRONMENT}-monitoring"');
    });
    
    it('should have deploy_stack function', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('deploy_stack()');
      expect(content).toContain('local stack_name=$1');
      expect(content).toContain('local stack_description=$2');
    });
    
    it('should deploy core stack first', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('deploy_stack "$CORE_STACK" "Core Infrastructure Stack"');
    });
    
    it('should deploy pipeline stack second', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('deploy_stack "$PIPELINE_STACK" "Pipeline Stack"');
    });
    
    it('should deploy monitoring stack third', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('deploy_stack "$MONITORING_STACK" "Monitoring Stack"');
    });
    
    it('should use --require-approval never for automated deployment', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('--require-approval never');
    });
    
    it('should save stack outputs to JSON files', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('--outputs-file');
      expect(content).toContain('cdk-outputs-');
    });
  });
  
  describe('Progress Logging', () => {
    it('should have log_info function', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('log_info()');
      expect(content).toContain('[INFO]');
    });
    
    it('should have log_success function', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('log_success()');
      expect(content).toContain('[SUCCESS]');
    });
    
    it('should have log_warning function', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('log_warning()');
      expect(content).toContain('[WARNING]');
    });
    
    it('should have log_error function', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('log_error()');
      expect(content).toContain('[ERROR]');
    });
    
    it('should use color codes for output', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('RED=');
      expect(content).toContain('GREEN=');
      expect(content).toContain('YELLOW=');
      expect(content).toContain('BLUE=');
      expect(content).toContain('NC='); // No Color
    });
    
    it('should log each deployment step', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for step logging
      expect(content).toContain('Step 1:');
      expect(content).toContain('Step 2:');
      expect(content).toContain('Step 3:');
      expect(content).toContain('Step 4:');
      expect(content).toContain('Step 5:');
      expect(content).toContain('Step 6:');
      expect(content).toContain('Step 7:');
      expect(content).toContain('Step 8:');
      expect(content).toContain('Step 9:');
      expect(content).toContain('Step 10:');
    });
  });
  
  describe('Post-Deployment Validation', () => {
    it('should call validate-deployment.sh script', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('validate-deployment.sh');
      expect(content).toContain('bash "$VALIDATION_SCRIPT"');
    });
    
    it('should check if validation script exists', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('if [ -f "$VALIDATION_SCRIPT" ]');
    });
    
    it('should warn if validation script not found', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('Validation script not found');
      expect(content).toContain('Skipping post-deployment validation');
    });
  });
  
  describe('Error Handling and Rollback Instructions', () => {
    it('should provide rollback instructions for core stack failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for rollback instructions after core stack deployment
      const coreFailureSection = content.match(/deploy_stack "\$CORE_STACK".*?exit 1/s);
      expect(coreFailureSection).toBeTruthy();
      expect(coreFailureSection![0]).toContain('Rollback instructions');
      expect(coreFailureSection![0]).toContain('cdk destroy $CORE_STACK');
    });
    
    it('should provide rollback instructions for pipeline stack failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for rollback instructions after pipeline stack deployment
      const pipelineFailureSection = content.match(/deploy_stack "\$PIPELINE_STACK".*?exit 1/s);
      expect(pipelineFailureSection).toBeTruthy();
      expect(pipelineFailureSection![0]).toContain('Rollback instructions');
      expect(pipelineFailureSection![0]).toContain('cdk destroy $PIPELINE_STACK');
    });
    
    it('should provide rollback instructions for monitoring stack failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for rollback instructions after monitoring stack deployment
      const monitoringFailureSection = content.match(/deploy_stack "\$MONITORING_STACK".*?exit 1/s);
      expect(monitoringFailureSection).toBeTruthy();
      expect(monitoringFailureSection![0]).toContain('Rollback instructions');
      expect(monitoringFailureSection![0]).toContain('cdk destroy $MONITORING_STACK');
    });
    
    it('should mention CloudFormation console in rollback instructions', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('CloudFormation console');
    });
    
    it('should exit with error code on failure', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Count exit 1 statements (should be multiple for different failure scenarios)
      const exitStatements = content.match(/exit 1/g);
      expect(exitStatements).toBeTruthy();
      expect(exitStatements!.length).toBeGreaterThan(5);
    });
  });
  
  describe('Deployment Summary', () => {
    it('should display deployment summary', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('Deployment Summary');
    });
    
    it('should show environment in summary', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('Environment:');
      expect(content).toContain('$ENVIRONMENT');
    });
    
    it('should show AWS account in summary', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('AWS Account:');
      expect(content).toContain('$AWS_ACCOUNT_ID');
    });
    
    it('should show AWS region in summary', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('AWS Region:');
      expect(content).toContain('$AWS_REGION');
    });
    
    it('should list deployed stacks', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('Deployed Stacks:');
      expect(content).toContain('$CORE_STACK');
      expect(content).toContain('$PIPELINE_STACK');
      expect(content).toContain('$MONITORING_STACK');
    });
    
    it('should provide next steps', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('Next Steps:');
      expect(content).toContain('Configure GitHub token secret');
      expect(content).toContain('Verify pipeline in AWS Console');
      expect(content).toContain('View CloudWatch dashboard');
    });
    
    it('should include GitHub token configuration command', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('aws secretsmanager put-secret-value');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}-github-token');
    });
    
    it('should include pipeline console URL', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('console.aws.amazon.com/codesuite/codepipeline');
      expect(content).toContain('kiro-pipeline-${ENVIRONMENT}');
    });
    
    it('should include CloudWatch dashboard URL', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('console.aws.amazon.com/cloudwatch');
      expect(content).toContain('kiro-worker-${ENVIRONMENT}');
    });
  });
  
  describe('Script Completeness', () => {
    it('should have all required sections', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      // Verify all major sections are present
      const requiredSections = [
        'Validating environment',
        'Checking AWS CLI',
        'Checking AWS CDK CLI',
        'Getting AWS account information',
        'Checking CDK bootstrap',
        'Installing dependencies',
        'Building TypeScript',
        'Synthesizing CDK',
        'Deploying stacks',
        'Post-deployment validation',
        'Deployment Summary'
      ];
      
      requiredSections.forEach(section => {
        expect(content.toLowerCase()).toContain(section.toLowerCase());
      });
    });
    
    it('should have proper script header', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('CD Pipeline Deployment Script');
      expect(content).toContain('Kiro CodeBuild Worker');
    });
    
    it('should have usage instructions', () => {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      
      expect(content).toContain('Usage:');
      expect(content).toContain('ENVIRONMENT=test ./deploy-pipeline.sh');
    });
  });
});
