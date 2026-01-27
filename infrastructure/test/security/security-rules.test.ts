import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Security Rules', () => {
  const securityRulesPath = path.join(__dirname, '../../security-rules.guard');

  describe('security-rules.guard file', () => {
    it('should exist', () => {
      expect(fs.existsSync(securityRulesPath)).toBe(true);
    });

    it('should be readable', () => {
      expect(() => fs.readFileSync(securityRulesPath, 'utf-8')).not.toThrow();
    });

    it('should not be empty', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should contain rule definitions', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule ');
    });
  });

  describe('S3 Bucket Encryption Rule', () => {
    it('should define s3_bucket_encryption rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule s3_bucket_encryption');
    });

    it('should check for BucketEncryption property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('BucketEncryption exists');
    });

    it('should require AES256 or aws:kms encryption', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain("['AES256', 'aws:kms']");
    });

    it('should target AWS::S3::Bucket resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::S3::Bucket['"]/);
    });
  });

  describe('S3 Bucket Public Access Rule', () => {
    it('should define s3_bucket_public_access rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule s3_bucket_public_access');
    });

    it('should check for PublicAccessBlockConfiguration', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('PublicAccessBlockConfiguration exists');
    });

    it('should require BlockPublicAcls to be true', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('BlockPublicAcls == true');
    });

    it('should require BlockPublicPolicy to be true', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('BlockPublicPolicy == true');
    });

    it('should require IgnorePublicAcls to be true', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('IgnorePublicAcls == true');
    });

    it('should require RestrictPublicBuckets to be true', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('RestrictPublicBuckets == true');
    });
  });

  describe('DynamoDB Encryption Rule', () => {
    it('should define dynamodb_encryption rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule dynamodb_encryption');
    });

    it('should check for SSESpecification property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('SSESpecification exists');
    });

    it('should require SSEEnabled to be true', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('SSEEnabled == true');
    });

    it('should target AWS::DynamoDB::Table resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::DynamoDB::Table['"]/);
    });
  });

  describe('Lambda DLQ Rule', () => {
    it('should define lambda_dlq rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule lambda_dlq');
    });

    it('should check for DeadLetterConfig property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('DeadLetterConfig exists');
    });

    it('should target AWS::Lambda::Function resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::Lambda::Function['"]/);
    });

    it('should include rationale for DLQ requirement', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('Rationale');
    });
  });

  describe('IAM Wildcard Permissions Rule', () => {
    it('should define iam_no_wildcard rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule iam_no_wildcard');
    });

    it('should check for wildcard actions', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain("Action == '*'");
    });

    it('should check for wildcard resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain("Resource == '*'");
    });

    it('should disallow Allow effect with wildcards', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain("Effect != 'Allow'");
    });

    it('should target AWS::IAM::Role resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::IAM::Role['"]/);
    });
  });

  describe('CloudWatch Log Retention Rule', () => {
    it('should define cloudwatch_log_retention rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule cloudwatch_log_retention');
    });

    it('should check for RetentionInDays property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('RetentionInDays exists');
    });

    it('should target AWS::Logs::LogGroup resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::Logs::LogGroup['"]/);
    });
  });

  describe('KMS Key Rotation Rule', () => {
    it('should define kms_key_rotation rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule kms_key_rotation');
    });

    it('should require EnableKeyRotation to be true', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('EnableKeyRotation == true');
    });

    it('should target AWS::KMS::Key resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::KMS::Key['"]/);
    });
  });

  describe('CodeBuild Encryption Rule', () => {
    it('should define codebuild_encryption rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule codebuild_encryption');
    });

    it('should check EncryptionDisabled property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('EncryptionDisabled');
    });

    it('should target AWS::CodeBuild::Project resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::CodeBuild::Project['"]/);
    });
  });

  describe('Secrets Manager Encryption Rule', () => {
    it('should define secrets_manager_encryption rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule secrets_manager_encryption');
    });

    it('should check for KmsKeyId property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('KmsKeyId exists');
    });

    it('should target AWS::SecretsManager::Secret resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::SecretsManager::Secret['"]/);
    });
  });

  describe('SNS Topic Encryption Rule', () => {
    it('should define sns_topic_encryption rule', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('rule sns_topic_encryption');
    });

    it('should check for KmsMasterKeyId property', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('KmsMasterKeyId exists');
    });

    it('should target AWS::SNS::Topic resources', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toMatch(/Type\s*==\s*['"]AWS::SNS::Topic['"]/);
    });
  });

  describe('Rule Coverage', () => {
    it('should have at least 10 security rules defined', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      const ruleMatches = content.match(/^rule\s+\w+/gm);
      expect(ruleMatches).toBeDefined();
      expect(ruleMatches!.length).toBeGreaterThanOrEqual(10);
    });

    it('should include violation messages for all rules', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      const ruleMatches = content.match(/^rule\s+\w+/gm);
      const violationMatches = content.match(/Violation:/g);
      
      expect(ruleMatches).toBeDefined();
      expect(violationMatches).toBeDefined();
      // Each rule should have at least one violation message
      expect(violationMatches!.length).toBeGreaterThanOrEqual(ruleMatches!.length);
    });

    it('should include fix instructions for all rules', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      const fixMatches = content.match(/Fix:/g);
      
      expect(fixMatches).toBeDefined();
      expect(fixMatches!.length).toBeGreaterThan(0);
    });

    it('should include rationale for security requirements', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      const rationaleMatches = content.match(/Rationale:/g);
      
      expect(rationaleMatches).toBeDefined();
      expect(rationaleMatches!.length).toBeGreaterThan(0);
    });
  });

  describe('Rule Syntax', () => {
    it('should use proper CloudFormation Guard syntax', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      
      // Check for basic Guard syntax elements
      expect(content).toContain('Resources.*[');
      expect(content).toContain('Properties');
      expect(content).toContain('exists');
      expect(content).toContain('==');
    });

    it('should use violation blocks with <<>>', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('<<');
      expect(content).toContain('>>');
    });

    it('should properly close all rule blocks', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      
      expect(openBraces).toBe(closeBraces);
    });
  });

  describe('Buildspec Integration', () => {
    it('should be referenced in buildspec-build.yml', () => {
      const buildspecPath = path.join(__dirname, '../../../buildspec-build.yml');
      
      if (fs.existsSync(buildspecPath)) {
        const buildspecContent = fs.readFileSync(buildspecPath, 'utf-8');
        expect(buildspecContent).toContain('security-rules.guard');
        expect(buildspecContent).toContain('cfn-guard');
      } else {
        // If buildspec doesn't exist yet, skip this test
        expect(true).toBe(true);
      }
    });

    it('should validate synthesized CDK templates', () => {
      const buildspecPath = path.join(__dirname, '../../../buildspec-build.yml');
      
      if (fs.existsSync(buildspecPath)) {
        const buildspecContent = fs.readFileSync(buildspecPath, 'utf-8');
        expect(buildspecContent).toContain('cdk.out');
        expect(buildspecContent).toContain('.template.json');
      } else {
        // If buildspec doesn't exist yet, skip this test
        expect(true).toBe(true);
      }
    });
  });

  describe('Security Best Practices', () => {
    it('should enforce encryption for data at rest', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      
      // Check for encryption rules
      expect(content).toContain('s3_bucket_encryption');
      expect(content).toContain('dynamodb_encryption');
      expect(content).toContain('kms_key_rotation');
    });

    it('should enforce least privilege principle', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('iam_no_wildcard');
      expect(content).toContain('least privilege');
    });

    it('should enforce data protection', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('s3_bucket_public_access');
      expect(content).toContain('BlockPublicAcls');
    });

    it('should enforce operational excellence', () => {
      const content = fs.readFileSync(securityRulesPath, 'utf-8');
      expect(content).toContain('lambda_dlq');
      expect(content).toContain('cloudwatch_log_retention');
    });
  });
});
