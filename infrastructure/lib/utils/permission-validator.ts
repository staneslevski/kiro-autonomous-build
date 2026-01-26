import {
  IAMClient,
  SimulatePrincipalPolicyCommand,
  SimulatePrincipalPolicyCommandInput,
  EvaluationResult,
} from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export interface PermissionValidationResult {
  allPermissionsValid: boolean;
  missingPermissions: MissingPermission[];
  validatedPermissions: string[];
  principalArn: string;
}

export interface MissingPermission {
  action: string;
  resource: string;
  reason: string;
  suggestedPolicy: string;
}

export interface RequiredPermission {
  action: string;
  resource: string;
  description: string;
}

export class PermissionValidator {
  private readonly iamClient: IAMClient;
  private readonly stsClient: STSClient;

  constructor(region: string = 'us-east-1') {
    this.iamClient = new IAMClient({ region });
    this.stsClient = new STSClient({ region });
  }

  /**
   * Validates that the current principal has all required deployment permissions
   */
  async validateDeploymentPermissions(
    environment: string
  ): Promise<PermissionValidationResult> {
    const requiredPermissions = this.getRequiredPermissions(environment);
    const principalArn = await this.getPrincipalArn();

    const missingPermissions: MissingPermission[] = [];
    const validatedPermissions: string[] = [];

    for (const permission of requiredPermissions) {
      const hasPermission = await this.checkPermission(
        principalArn,
        permission.action,
        permission.resource
      );

      if (hasPermission) {
        validatedPermissions.push(permission.action);
      } else {
        missingPermissions.push({
          action: permission.action,
          resource: permission.resource,
          reason: `Missing permission for ${permission.description}`,
          suggestedPolicy: this.generatePolicySnippet(
            permission.action,
            permission.resource
          ),
        });
      }
    }

    return {
      allPermissionsValid: missingPermissions.length === 0,
      missingPermissions,
      validatedPermissions,
      principalArn,
    };
  }

  /**
   * Checks if the principal has a specific permission
   */
  async checkPermission(
    principalArn: string,
    action: string,
    resource: string
  ): Promise<boolean> {
    try {
      const input: SimulatePrincipalPolicyCommandInput = {
        PolicySourceArn: principalArn,
        ActionNames: [action],
        ResourceArns: [resource],
      };

      const command = new SimulatePrincipalPolicyCommand(input);
      const response = await this.iamClient.send(command);

      if (!response.EvaluationResults || response.EvaluationResults.length === 0) {
        return false;
      }

      const result: EvaluationResult = response.EvaluationResults[0];
      return result.EvalDecision === 'allowed';
    } catch (error) {
      console.error(`Error checking permission ${action}:`, error);
      return false;
    }
  }

  /**
   * Gets the ARN of the current principal (user or role)
   */
  async getPrincipalArn(): Promise<string> {
    try {
      const command = new GetCallerIdentityCommand({});
      const response = await this.stsClient.send(command);
      return response.Arn || '';
    } catch (error) {
      throw new Error(`Failed to get caller identity: ${error}`);
    }
  }

  /**
   * Generates a missing permissions report with actionable guidance
   */
  generateMissingPermissionsReport(
    result: PermissionValidationResult
  ): string {
    if (result.allPermissionsValid) {
      return '✓ All required permissions are present';
    }

    let report = '✗ Missing Required Permissions\n\n';
    report += `Principal: ${result.principalArn}\n\n`;
    report += 'The following permissions are missing:\n\n';

    for (const missing of result.missingPermissions) {
      report += `- Action: ${missing.action}\n`;
      report += `  Resource: ${missing.resource}\n`;
      report += `  Reason: ${missing.reason}\n`;
      report += `  Suggested Policy:\n${missing.suggestedPolicy}\n\n`;
    }

    report += '\nTo fix these issues:\n';
    report += '1. Create an IAM policy with the suggested permissions above\n';
    report += '2. Attach the policy to your user or role\n';
    report += '3. Run the validation again\n\n';
    report += 'See docs/deployment/iam-permissions.md for complete policy examples\n';

    return report;
  }

  /**
   * Gets the list of required permissions for deployment
   */
  private getRequiredPermissions(environment: string): RequiredPermission[] {
    const accountId = '*'; // Will be replaced with actual account ID
    const region = '*'; // Will be replaced with actual region

    return [
      // CloudFormation permissions
      {
        action: 'cloudformation:CreateStack',
        resource: `arn:aws:cloudformation:${region}:${accountId}:stack/KiroWorker*/*`,
        description: 'creating CloudFormation stacks',
      },
      {
        action: 'cloudformation:UpdateStack',
        resource: `arn:aws:cloudformation:${region}:${accountId}:stack/KiroWorker*/*`,
        description: 'updating CloudFormation stacks',
      },
      {
        action: 'cloudformation:DeleteStack',
        resource: `arn:aws:cloudformation:${region}:${accountId}:stack/KiroWorker*/*`,
        description: 'deleting CloudFormation stacks',
      },
      {
        action: 'cloudformation:DescribeStacks',
        resource: '*',
        description: 'describing CloudFormation stacks',
      },
      // IAM permissions
      {
        action: 'iam:CreateRole',
        resource: `arn:aws:iam::${accountId}:role/KiroWorker*`,
        description: 'creating IAM roles',
      },
      {
        action: 'iam:PassRole',
        resource: `arn:aws:iam::${accountId}:role/KiroWorker*`,
        description: 'passing IAM roles to services',
      },
      {
        action: 'iam:AttachRolePolicy',
        resource: `arn:aws:iam::${accountId}:role/KiroWorker*`,
        description: 'attaching policies to IAM roles',
      },
      // S3 permissions
      {
        action: 's3:CreateBucket',
        resource: 'arn:aws:s3:::kiro-worker-*',
        description: 'creating S3 buckets',
      },
      {
        action: 's3:PutBucketPolicy',
        resource: 'arn:aws:s3:::kiro-worker-*',
        description: 'setting S3 bucket policies',
      },
      // DynamoDB permissions
      {
        action: 'dynamodb:CreateTable',
        resource: `arn:aws:dynamodb:${region}:${accountId}:table/kiro-worker-*`,
        description: 'creating DynamoDB tables',
      },
      // Lambda permissions
      {
        action: 'lambda:CreateFunction',
        resource: `arn:aws:lambda:${region}:${accountId}:function:kiro-worker-*`,
        description: 'creating Lambda functions',
      },
      // CodeBuild permissions
      {
        action: 'codebuild:CreateProject',
        resource: `arn:aws:codebuild:${region}:${accountId}:project/kiro-worker-*`,
        description: 'creating CodeBuild projects',
      },
      // Secrets Manager permissions
      {
        action: 'secretsmanager:CreateSecret',
        resource: `arn:aws:secretsmanager:${region}:${accountId}:secret:kiro-worker-*`,
        description: 'creating Secrets Manager secrets',
      },
      // EventBridge permissions
      {
        action: 'events:PutRule',
        resource: `arn:aws:events:${region}:${accountId}:rule/kiro-worker-*`,
        description: 'creating EventBridge rules',
      },
      // CloudWatch permissions
      {
        action: 'logs:CreateLogGroup',
        resource: `arn:aws:logs:${region}:${accountId}:log-group:/aws/*/kiro-worker-*`,
        description: 'creating CloudWatch log groups',
      },
      {
        action: 'cloudwatch:PutMetricAlarm',
        resource: `arn:aws:cloudwatch:${region}:${accountId}:alarm:kiro-worker-*`,
        description: 'creating CloudWatch alarms',
      },
      // SNS permissions
      {
        action: 'sns:CreateTopic',
        resource: `arn:aws:sns:${region}:${accountId}:kiro-worker-*`,
        description: 'creating SNS topics',
      },
    ];
  }

  /**
   * Generates an IAM policy snippet for a missing permission
   */
  private generatePolicySnippet(action: string, resource: string): string {
    return `  {
    "Effect": "Allow",
    "Action": "${action}",
    "Resource": "${resource}"
  }`;
  }
}
