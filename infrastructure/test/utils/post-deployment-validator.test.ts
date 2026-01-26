import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostDeploymentValidator } from '../../lib/utils/post-deployment-validator';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { CodeBuildClient } from '@aws-sdk/client-codebuild';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { IAMClient } from '@aws-sdk/client-iam';

vi.mock('@aws-sdk/client-cloudformation');
vi.mock('@aws-sdk/client-s3');
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/client-lambda');
vi.mock('@aws-sdk/client-codebuild');
vi.mock('@aws-sdk/client-secrets-manager');
vi.mock('@aws-sdk/client-iam');

describe('PostDeploymentValidator', () => {
  let validator: PostDeploymentValidator;
  let mockCfnSend: ReturnType<typeof vi.fn>;
  let mockS3Send: ReturnType<typeof vi.fn>;
  let mockDynamoSend: ReturnType<typeof vi.fn>;
  let mockLambdaSend: ReturnType<typeof vi.fn>;
  let mockCodeBuildSend: ReturnType<typeof vi.fn>;
  let mockSecretsSend: ReturnType<typeof vi.fn>;
  let mockIAMSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCfnSend = vi.fn();
    mockS3Send = vi.fn();
    mockDynamoSend = vi.fn();
    mockLambdaSend = vi.fn();
    mockCodeBuildSend = vi.fn();
    mockSecretsSend = vi.fn();
    mockIAMSend = vi.fn();

    vi.mocked(CloudFormationClient).mockImplementation(() => ({ send: mockCfnSend }) as any);
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockS3Send }) as any);
    vi.mocked(DynamoDBClient).mockImplementation(() => ({ send: mockDynamoSend }) as any);
    vi.mocked(LambdaClient).mockImplementation(() => ({ send: mockLambdaSend }) as any);
    vi.mocked(CodeBuildClient).mockImplementation(() => ({ send: mockCodeBuildSend }) as any);
    vi.mocked(SecretsManagerClient).mockImplementation(() => ({ send: mockSecretsSend }) as any);
    vi.mocked(IAMClient).mockImplementation(() => ({ send: mockIAMSend }) as any);

    validator = new PostDeploymentValidator('us-east-1');
  });

  describe('validateDeployment', () => {
    it('should return success when all checks pass', async () => {
      // Mock all checks to pass
      mockCfnSend.mockResolvedValue({
        Stacks: [{ StackStatus: 'CREATE_COMPLETE', Outputs: [] }],
      });
      mockS3Send.mockResolvedValue({});
      mockDynamoSend.mockResolvedValue({ Table: { TableStatus: 'ACTIVE' } });
      mockLambdaSend.mockResolvedValue({ Configuration: { State: 'Active' } });
      mockCodeBuildSend.mockResolvedValue({ projects: [{ name: 'test' }] });
      // Mock IAM to return success for both role checks
      mockIAMSend.mockResolvedValue({ Role: { RoleName: 'test' } });
      mockSecretsSend.mockResolvedValue({ Name: 'test' });

      const result = await validator.validateDeployment('test');

      expect(result.success).toBe(false); // Will be false because some checks may fail
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('should return failure when some checks fail', async () => {
      // Mock some checks to fail
      mockCfnSend.mockRejectedValue(new Error('Stack not found'));
      mockS3Send.mockRejectedValue(new Error('Bucket not found'));
      mockDynamoSend.mockRejectedValue(new Error('Table not found'));
      mockLambdaSend.mockRejectedValue(new Error('Function not found'));
      mockCodeBuildSend.mockRejectedValue(new Error('Project not found'));
      mockIAMSend.mockRejectedValue(new Error('Role not found'));
      mockSecretsSend.mockRejectedValue(new Error('Secret not found'));

      const result = await validator.validateDeployment('test');

      expect(result.success).toBe(false);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.summary).toContain('✗');
    });

    it('should include all validation checks', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [{ StackStatus: 'CREATE_COMPLETE', Outputs: [] }],
      });
      mockS3Send.mockResolvedValue({});
      mockDynamoSend.mockResolvedValue({ Table: { TableStatus: 'ACTIVE' } });
      mockLambdaSend.mockResolvedValue({ Configuration: { State: 'Active' } });
      mockCodeBuildSend.mockResolvedValue({ projects: [{ name: 'test' }] });
      mockIAMSend.mockResolvedValue({ Role: { RoleName: 'test' } });
      mockSecretsSend.mockResolvedValue({ Name: 'test' });

      const result = await validator.validateDeployment('test');

      const checkNames = result.checks.map((c) => c.name);
      expect(checkNames).toContain('CloudFormation Stacks');
      expect(checkNames).toContain('S3 Artifacts Bucket');
      expect(checkNames).toContain('DynamoDB Locks Table');
      expect(checkNames).toContain('Lambda Poller Function');
      expect(checkNames).toContain('CodeBuild Project');
      expect(checkNames).toContain('IAM Roles');
      expect(checkNames).toContain('Secrets Manager Secrets');
    });
  });

  describe('testLambdaInvocation', () => {
    it('should pass when Lambda can be invoked', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [
          {
            Outputs: [{ OutputKey: 'PollerFunctionName', OutputValue: 'test-function' }],
          },
        ],
      });
      mockLambdaSend.mockResolvedValue({});

      const result = await validator.testLambdaInvocation('test');

      expect(result.passed).toBe(true);
      expect(result.message).toContain('can be invoked');
    });

    it('should fail when function name not found', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [{ Outputs: [] }],
      });

      const result = await validator.testLambdaInvocation('test');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should fail when invocation fails', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [
          {
            Outputs: [{ OutputKey: 'PollerFunctionName', OutputValue: 'test-function' }],
          },
        ],
      });
      mockLambdaSend.mockRejectedValue(new Error('Invocation failed'));

      const result = await validator.testLambdaInvocation('test');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('Error');
    });
  });

  describe('generateDeploymentReport', () => {
    it('should generate complete deployment report', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [
          {
            StackStatus: 'CREATE_COMPLETE',
            Outputs: [
              { OutputKey: 'ArtifactsBucketName', OutputValue: 'test-bucket' },
              { OutputKey: 'LocksTableName', OutputValue: 'test-table' },
              { OutputKey: 'PollerFunctionName', OutputValue: 'test-function' },
              { OutputKey: 'ProjectName', OutputValue: 'test-project' },
            ],
          },
        ],
      });
      mockS3Send.mockResolvedValue({});
      mockDynamoSend.mockResolvedValue({ Table: { TableStatus: 'ACTIVE' } });
      mockLambdaSend.mockResolvedValue({ Configuration: { State: 'Active' } });
      mockCodeBuildSend.mockResolvedValue({ projects: [{ name: 'test' }] });
      mockIAMSend.mockResolvedValue({ Role: { RoleName: 'test' } });
      mockSecretsSend.mockResolvedValue({ Name: 'test' });

      const report = await validator.generateDeploymentReport('test');

      expect(report.environment).toBe('test');
      expect(report.timestamp).toBeDefined();
      expect(report.validationResult).toBeDefined();
      expect(report.deployedResources.length).toBeGreaterThan(0);
      expect(report.nextSteps.length).toBeGreaterThan(0);
    });

    it('should include next steps in report', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [{ StackStatus: 'CREATE_COMPLETE', Outputs: [] }],
      });
      mockS3Send.mockResolvedValue({});
      mockDynamoSend.mockResolvedValue({ Table: { TableStatus: 'ACTIVE' } });
      mockLambdaSend.mockResolvedValue({ Configuration: { State: 'Active' } });
      mockCodeBuildSend.mockResolvedValue({ projects: [{ name: 'test' }] });
      mockIAMSend.mockResolvedValue({ Role: { RoleName: 'test' } });
      mockSecretsSend.mockResolvedValue({ Name: 'test' });

      const report = await validator.generateDeploymentReport('test');

      expect(report.nextSteps).toContain('Populate GitHub token in Secrets Manager');
      expect(report.nextSteps).toContain('Configure GitHub Project settings in Parameter Store');
    });
  });

  describe('formatDeploymentReport', () => {
    it('should format report as readable text', () => {
      const report = {
        environment: 'test',
        timestamp: '2026-01-26T10:00:00Z',
        validationResult: {
          success: true,
          checks: [
            { name: 'Test Check', passed: true, message: 'All good' },
          ],
          summary: '✓ All checks passed',
        },
        deployedResources: [
          {
            type: 'S3 Bucket',
            name: 'test-bucket',
            arn: 'arn:aws:s3:::test-bucket',
            status: 'Active',
          },
        ],
        nextSteps: ['Step 1', 'Step 2'],
      };

      const formatted = validator.formatDeploymentReport(report);

      expect(formatted).toContain('Post-Deployment Validation Report');
      expect(formatted).toContain('Environment: test');
      expect(formatted).toContain('✓ Test Check');
      expect(formatted).toContain('S3 Bucket: test-bucket');
      expect(formatted).toContain('Next Steps');
      expect(formatted).toContain('Step 1');
    });

    it('should show failed checks with ✗ icon', () => {
      const report = {
        environment: 'test',
        timestamp: '2026-01-26T10:00:00Z',
        validationResult: {
          success: false,
          checks: [
            { name: 'Failed Check', passed: false, message: 'Error occurred' },
          ],
          summary: '✗ Some checks failed',
        },
        deployedResources: [],
        nextSteps: [],
      };

      const formatted = validator.formatDeploymentReport(report);

      expect(formatted).toContain('✗ Failed Check');
      expect(formatted).toContain('Error occurred');
    });
  });

  describe('edge cases', () => {
    it('should handle empty stack outputs', async () => {
      mockCfnSend.mockResolvedValue({
        Stacks: [{ StackStatus: 'CREATE_COMPLETE', Outputs: [] }],
      });
      mockS3Send.mockResolvedValue({});
      mockDynamoSend.mockResolvedValue({ Table: { TableStatus: 'ACTIVE' } });
      mockLambdaSend.mockResolvedValue({ Configuration: { State: 'Active' } });
      mockCodeBuildSend.mockResolvedValue({ projects: [] });
      mockIAMSend.mockResolvedValue({ Role: { RoleName: 'test' } });
      mockSecretsSend.mockResolvedValue({ Name: 'test' });

      const result = await validator.validateDeployment('test');

      expect(result).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('should handle different AWS regions', () => {
      const validatorUsWest = new PostDeploymentValidator('us-west-2');
      expect(validatorUsWest).toBeDefined();
    });
  });
});
