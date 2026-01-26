import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionValidator } from '../../lib/utils/permission-validator';
import { IAMClient, SimulatePrincipalPolicyCommand } from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

vi.mock('@aws-sdk/client-iam');
vi.mock('@aws-sdk/client-sts');

describe('PermissionValidator', () => {
  let validator: PermissionValidator;
  let mockIAMSend: ReturnType<typeof vi.fn>;
  let mockSTSSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockIAMSend = vi.fn();
    mockSTSSend = vi.fn();

    vi.mocked(IAMClient).mockImplementation(
      () =>
        ({
          send: mockIAMSend,
        }) as any
    );

    vi.mocked(STSClient).mockImplementation(
      () =>
        ({
          send: mockSTSSend,
        }) as any
    );

    validator = new PermissionValidator('us-east-1');
  });

  describe('getPrincipalArn', () => {
    it('should return the ARN of the current principal', async () => {
      const mockArn = 'arn:aws:iam::123456789012:user/deployer';
      mockSTSSend.mockResolvedValue({
        Arn: mockArn,
        UserId: 'AIDAEXAMPLE',
        Account: '123456789012',
      });

      const arn = await validator.getPrincipalArn();

      expect(arn).toBe(mockArn);
      expect(mockSTSSend).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand));
    });

    it('should throw error if GetCallerIdentity fails', async () => {
      mockSTSSend.mockRejectedValue(new Error('Access denied'));

      await expect(validator.getPrincipalArn()).rejects.toThrow(
        'Failed to get caller identity'
      );
    });

    it('should return empty string if ARN is not present', async () => {
      mockSTSSend.mockResolvedValue({
        UserId: 'AIDAEXAMPLE',
        Account: '123456789012',
      });

      const arn = await validator.getPrincipalArn();

      expect(arn).toBe('');
    });
  });

  describe('checkPermission', () => {
    const principalArn = 'arn:aws:iam::123456789012:user/deployer';
    const action = 'cloudformation:CreateStack';
    const resource = 'arn:aws:cloudformation:us-east-1:123456789012:stack/KiroWorker*/*';

    it('should return true when permission is allowed', async () => {
      mockIAMSend.mockResolvedValue({
        EvaluationResults: [
          {
            EvalActionName: action,
            EvalResourceName: resource,
            EvalDecision: 'allowed',
          },
        ],
      });

      const hasPermission = await validator.checkPermission(
        principalArn,
        action,
        resource
      );

      expect(hasPermission).toBe(true);
      expect(mockIAMSend).toHaveBeenCalledWith(
        expect.any(SimulatePrincipalPolicyCommand)
      );
    });

    it('should return false when permission is denied', async () => {
      mockIAMSend.mockResolvedValue({
        EvaluationResults: [
          {
            EvalActionName: action,
            EvalResourceName: resource,
            EvalDecision: 'explicitDeny',
          },
        ],
      });

      const hasPermission = await validator.checkPermission(
        principalArn,
        action,
        resource
      );

      expect(hasPermission).toBe(false);
    });

    it('should return false when no evaluation results', async () => {
      mockIAMSend.mockResolvedValue({
        EvaluationResults: [],
      });

      const hasPermission = await validator.checkPermission(
        principalArn,
        action,
        resource
      );

      expect(hasPermission).toBe(false);
    });

    it('should return false when evaluation results is undefined', async () => {
      mockIAMSend.mockResolvedValue({});

      const hasPermission = await validator.checkPermission(
        principalArn,
        action,
        resource
      );

      expect(hasPermission).toBe(false);
    });

    it('should return false and log error on API failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockIAMSend.mockRejectedValue(new Error('API error'));

      const hasPermission = await validator.checkPermission(
        principalArn,
        action,
        resource
      );

      expect(hasPermission).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('validateDeploymentPermissions', () => {
    const principalArn = 'arn:aws:iam::123456789012:user/deployer';

    beforeEach(() => {
      mockSTSSend.mockResolvedValue({
        Arn: principalArn,
      });
    });

    it('should return all permissions valid when all checks pass', async () => {
      mockIAMSend.mockResolvedValue({
        EvaluationResults: [
          {
            EvalDecision: 'allowed',
          },
        ],
      });

      const result = await validator.validateDeploymentPermissions('test');

      expect(result.allPermissionsValid).toBe(true);
      expect(result.missingPermissions).toHaveLength(0);
      expect(result.validatedPermissions.length).toBeGreaterThan(0);
      expect(result.principalArn).toBe(principalArn);
    });

    it('should return missing permissions when some checks fail', async () => {
      let callCount = 0;
      mockIAMSend.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          EvaluationResults: [
            {
              EvalDecision: callCount === 1 ? 'allowed' : 'explicitDeny',
            },
          ],
        });
      });

      const result = await validator.validateDeploymentPermissions('test');

      expect(result.allPermissionsValid).toBe(false);
      expect(result.missingPermissions.length).toBeGreaterThan(0);
      expect(result.validatedPermissions.length).toBeGreaterThan(0);
    });

    it('should include action, resource, and reason in missing permissions', async () => {
      mockIAMSend.mockResolvedValue({
        EvaluationResults: [
          {
            EvalDecision: 'explicitDeny',
          },
        ],
      });

      const result = await validator.validateDeploymentPermissions('test');

      expect(result.missingPermissions.length).toBeGreaterThan(0);
      const missing = result.missingPermissions[0];
      expect(missing.action).toBeDefined();
      expect(missing.resource).toBeDefined();
      expect(missing.reason).toBeDefined();
      expect(missing.suggestedPolicy).toBeDefined();
    });
  });

  describe('generateMissingPermissionsReport', () => {
    it('should return success message when all permissions valid', () => {
      const result = {
        allPermissionsValid: true,
        missingPermissions: [],
        validatedPermissions: ['cloudformation:CreateStack'],
        principalArn: 'arn:aws:iam::123456789012:user/deployer',
      };

      const report = validator.generateMissingPermissionsReport(result);

      expect(report).toContain('✓ All required permissions are present');
    });

    it('should return detailed report when permissions are missing', () => {
      const result = {
        allPermissionsValid: false,
        missingPermissions: [
          {
            action: 'cloudformation:CreateStack',
            resource: 'arn:aws:cloudformation:*:*:stack/KiroWorker*/*',
            reason: 'Missing permission for creating CloudFormation stacks',
            suggestedPolicy: '{\n  "Effect": "Allow",\n  "Action": "cloudformation:CreateStack"\n}',
          },
        ],
        validatedPermissions: [],
        principalArn: 'arn:aws:iam::123456789012:user/deployer',
      };

      const report = validator.generateMissingPermissionsReport(result);

      expect(report).toContain('✗ Missing Required Permissions');
      expect(report).toContain('arn:aws:iam::123456789012:user/deployer');
      expect(report).toContain('cloudformation:CreateStack');
      expect(report).toContain('Missing permission for creating CloudFormation stacks');
      expect(report).toContain('Suggested Policy');
      expect(report).toContain('To fix these issues');
    });

    it('should include multiple missing permissions in report', () => {
      const result = {
        allPermissionsValid: false,
        missingPermissions: [
          {
            action: 'cloudformation:CreateStack',
            resource: 'arn:aws:cloudformation:*:*:stack/KiroWorker*/*',
            reason: 'Missing permission for creating CloudFormation stacks',
            suggestedPolicy: '{\n  "Effect": "Allow"\n}',
          },
          {
            action: 'iam:CreateRole',
            resource: 'arn:aws:iam::*:role/KiroWorker*',
            reason: 'Missing permission for creating IAM roles',
            suggestedPolicy: '{\n  "Effect": "Allow"\n}',
          },
        ],
        validatedPermissions: [],
        principalArn: 'arn:aws:iam::123456789012:user/deployer',
      };

      const report = validator.generateMissingPermissionsReport(result);

      expect(report).toContain('cloudformation:CreateStack');
      expect(report).toContain('iam:CreateRole');
    });

    it('should include link to documentation', () => {
      const result = {
        allPermissionsValid: false,
        missingPermissions: [
          {
            action: 'cloudformation:CreateStack',
            resource: 'arn:aws:cloudformation:*:*:stack/KiroWorker*/*',
            reason: 'Missing permission',
            suggestedPolicy: '{}',
          },
        ],
        validatedPermissions: [],
        principalArn: 'arn:aws:iam::123456789012:user/deployer',
      };

      const report = validator.generateMissingPermissionsReport(result);

      expect(report).toContain('docs/deployment/iam-permissions.md');
    });
  });

  describe('edge cases', () => {
    it('should handle empty environment string', async () => {
      mockSTSSend.mockResolvedValue({
        Arn: 'arn:aws:iam::123456789012:user/deployer',
      });
      mockIAMSend.mockResolvedValue({
        EvaluationResults: [{ EvalDecision: 'allowed' }],
      });

      const result = await validator.validateDeploymentPermissions('');

      expect(result).toBeDefined();
      expect(result.principalArn).toBeDefined();
    });

    it('should handle different AWS regions', () => {
      const validatorUsWest = new PermissionValidator('us-west-2');
      expect(validatorUsWest).toBeDefined();
    });
  });
});
