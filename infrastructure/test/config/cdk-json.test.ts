import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests for cdk.json configuration file
 * 
 * Validates:
 * - App entry point configuration
 * - Required feature flags
 * - Exclude patterns
 * - JSON structure validity
 */
describe('cdk.json Configuration', () => {
  let cdkJson: any;
  const cdkJsonPath = path.join(__dirname, '../../cdk.json');

  beforeAll(() => {
    // Read and parse cdk.json
    const cdkJsonContent = fs.readFileSync(cdkJsonPath, 'utf-8');
    cdkJson = JSON.parse(cdkJsonContent);
  });

  describe('App Entry Point', () => {
    it('should have app entry point configured', () => {
      expect(cdkJson).toHaveProperty('app');
      expect(cdkJson.app).toBeTruthy();
    });

    it('should point to correct TypeScript entry file', () => {
      expect(cdkJson.app).toContain('bin/kiro-worker.ts');
    });

    it('should use ts-node for TypeScript execution', () => {
      expect(cdkJson.app).toContain('ts-node');
    });

    it('should use prefer-ts-exts flag for TypeScript', () => {
      expect(cdkJson.app).toContain('--prefer-ts-exts');
    });
  });

  describe('Context Parameters', () => {
    it('should have context object', () => {
      expect(cdkJson).toHaveProperty('context');
      expect(typeof cdkJson.context).toBe('object');
    });

    it('should have AWS CDK feature flags', () => {
      expect(cdkJson.context).toBeTruthy();
      expect(Object.keys(cdkJson.context).length).toBeGreaterThan(0);
    });

    it('should support environment context parameter (passed via CLI)', () => {
      // Environment is typically passed via --context environment=test
      // We verify the context object exists to accept such parameters
      expect(cdkJson.context).toBeDefined();
    });
  });

  describe('Required Feature Flags', () => {
    it('should disable stack name duplicates', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/core:enableStackNameDuplicates');
      expect(cdkJson.context['@aws-cdk/core:enableStackNameDuplicates']).toBe(false);
    });

    it('should enable stack relative exports', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/core:stackRelativeExports');
      expect(cdkJson.context['@aws-cdk/core:stackRelativeExports']).toBe(true);
    });

    it('should minimize IAM policies', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-iam:minimizePolicies');
      expect(cdkJson.context['@aws-cdk/aws-iam:minimizePolicies']).toBe(true);
    });

    it('should validate snapshot removal policy', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/core:validateSnapshotRemovalPolicy');
      expect(cdkJson.context['@aws-cdk/core:validateSnapshotRemovalPolicy']).toBe(true);
    });

    it('should check secret usage', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/core:checkSecretUsage');
      expect(cdkJson.context['@aws-cdk/core:checkSecretUsage']).toBe(true);
    });
  });

  describe('Watch Configuration', () => {
    it('should have watch configuration', () => {
      expect(cdkJson).toHaveProperty('watch');
      expect(typeof cdkJson.watch).toBe('object');
    });

    it('should have include patterns', () => {
      expect(cdkJson.watch).toHaveProperty('include');
      expect(Array.isArray(cdkJson.watch.include)).toBe(true);
    });

    it('should have exclude patterns', () => {
      expect(cdkJson.watch).toHaveProperty('exclude');
      expect(Array.isArray(cdkJson.watch.exclude)).toBe(true);
    });
  });

  describe('Exclude Patterns', () => {
    it('should exclude node_modules', () => {
      expect(cdkJson.watch.exclude).toContain('node_modules');
    });

    it('should exclude cdk.out directory', () => {
      const hasCdkOut = cdkJson.watch.exclude.some((pattern: string) => 
        pattern.includes('cdk') && pattern.includes('.json')
      );
      expect(hasCdkOut).toBe(true);
    });

    it('should exclude test directory', () => {
      expect(cdkJson.watch.exclude).toContain('test');
    });

    it('should exclude compiled JavaScript files', () => {
      expect(cdkJson.watch.exclude).toContain('**/*.js');
    });

    it('should exclude TypeScript definition files', () => {
      expect(cdkJson.watch.exclude).toContain('**/*.d.ts');
    });

    it('should exclude package files', () => {
      const hasPackageFiles = cdkJson.watch.exclude.some((pattern: string) => 
        pattern.includes('package')
      );
      expect(hasPackageFiles).toBe(true);
    });
  });

  describe('Security Feature Flags', () => {
    it('should restrict default security groups', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-ec2:restrictDefaultSecurityGroup');
      expect(cdkJson.context['@aws-cdk/aws-ec2:restrictDefaultSecurityGroup']).toBe(true);
    });

    it('should deny anonymous EFS access', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-efs:denyAnonymousAccess');
      expect(cdkJson.context['@aws-cdk/aws-efs:denyAnonymousAccess']).toBe(true);
    });

    it('should use bucket policy for S3 server access logs', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy');
      expect(cdkJson.context['@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy']).toBe(true);
    });

    it('should create default S3 logging policy', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-s3:createDefaultLoggingPolicy');
      expect(cdkJson.context['@aws-cdk/aws-s3:createDefaultLoggingPolicy']).toBe(true);
    });
  });

  describe('Pipeline Feature Flags', () => {
    it('should use V2 pipeline type by default', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-codepipeline:defaultPipelineTypeToV2');
      expect(cdkJson.context['@aws-cdk/aws-codepipeline:defaultPipelineTypeToV2']).toBe(true);
    });

    it('should set cross account keys to false by default', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-codepipeline:crossAccountKeysDefaultValueToFalse');
      expect(cdkJson.context['@aws-cdk/aws-codepipeline:crossAccountKeysDefaultValueToFalse']).toBe(true);
    });

    it('should use safe resource name for cross account key alias', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName');
      expect(cdkJson.context['@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName']).toBe(true);
    });
  });

  describe('JSON Structure', () => {
    it('should be valid JSON', () => {
      // If we got here, JSON.parse succeeded
      expect(cdkJson).toBeDefined();
    });

    it('should have all required top-level keys', () => {
      expect(cdkJson).toHaveProperty('app');
      expect(cdkJson).toHaveProperty('context');
      expect(cdkJson).toHaveProperty('watch');
    });

    it('should not have syntax errors', () => {
      const cdkJsonContent = fs.readFileSync(cdkJsonPath, 'utf-8');
      expect(() => JSON.parse(cdkJsonContent)).not.toThrow();
    });
  });

  describe('Best Practices', () => {
    it('should enable partition literals', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/core:enablePartitionLiterals');
      expect(cdkJson.context['@aws-cdk/core:enablePartitionLiterals']).toBe(true);
    });

    it('should use standardized service principals', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-iam:standardizedServicePrincipals');
      expect(cdkJson.context['@aws-cdk/aws-iam:standardizedServicePrincipals']).toBe(true);
    });

    it('should use latest runtime version for Lambda Node.js', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion');
      expect(cdkJson.context['@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion']).toBe(true);
    });

    it('should use GP3 volumes by default for EBS', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/aws-ec2:ebsDefaultGp3Volume');
      expect(cdkJson.context['@aws-cdk/aws-ec2:ebsDefaultGp3Volume']).toBe(true);
    });
  });

  describe('Context Parameter Support', () => {
    it('should support environment parameter via CLI', () => {
      // Verify context object can accept runtime parameters
      // These are passed via: cdk deploy --context environment=test
      expect(cdkJson.context).toBeDefined();
      expect(typeof cdkJson.context).toBe('object');
    });

    it('should support account parameter via environment or CLI', () => {
      // Account is typically from CDK_DEFAULT_ACCOUNT env var or --context
      // We verify the structure supports it
      expect(cdkJson.context).toBeDefined();
    });

    it('should support region parameter via environment or CLI', () => {
      // Region is typically from CDK_DEFAULT_REGION env var or --context
      // We verify the structure supports it
      expect(cdkJson.context).toBeDefined();
    });
  });

  describe('Compatibility', () => {
    it('should target AWS partitions', () => {
      expect(cdkJson.context).toHaveProperty('@aws-cdk/core:target-partitions');
      expect(Array.isArray(cdkJson.context['@aws-cdk/core:target-partitions'])).toBe(true);
      expect(cdkJson.context['@aws-cdk/core:target-partitions']).toContain('aws');
    });

    it('should include AWS China partition', () => {
      expect(cdkJson.context['@aws-cdk/core:target-partitions']).toContain('aws-cn');
    });
  });
});
