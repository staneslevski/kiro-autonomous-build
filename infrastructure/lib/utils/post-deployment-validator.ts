import {
  CloudFormationClient,
  DescribeStacksCommand,
  Stack,
} from '@aws-sdk/client-cloudformation';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, GetFunctionCommand, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  CodeBuildClient,
  BatchGetProjectsCommand,
} from '@aws-sdk/client-codebuild';
import {
  SecretsManagerClient,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { IAMClient, GetRoleCommand } from '@aws-sdk/client-iam';

export interface ValidationResult {
  success: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

export interface DeploymentReport {
  environment: string;
  timestamp: string;
  validationResult: ValidationResult;
  deployedResources: DeployedResource[];
  nextSteps: string[];
}

export interface DeployedResource {
  type: string;
  name: string;
  arn?: string;
  status: string;
}

export class PostDeploymentValidator {
  private readonly cfnClient: CloudFormationClient;
  private readonly s3Client: S3Client;
  private readonly dynamoClient: DynamoDBClient;
  private readonly lambdaClient: LambdaClient;
  private readonly codeBuildClient: CodeBuildClient;
  private readonly secretsClient: SecretsManagerClient;
  private readonly iamClient: IAMClient;

  constructor(region: string = 'us-east-1') {
    this.cfnClient = new CloudFormationClient({ region });
    this.s3Client = new S3Client({ region });
    this.dynamoClient = new DynamoDBClient({ region });
    this.lambdaClient = new LambdaClient({ region });
    this.codeBuildClient = new CodeBuildClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.iamClient = new IAMClient({ region });
  }

  /**
   * Validates all deployed resources
   */
  async validateDeployment(environment: string): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];

    // Validate CloudFormation stacks
    checks.push(await this.validateStacks(environment));

    // Validate S3 bucket
    checks.push(await this.validateS3Bucket(environment));

    // Validate DynamoDB table
    checks.push(await this.validateDynamoDBTable(environment));

    // Validate Lambda function
    checks.push(await this.validateLambdaFunction(environment));

    // Validate CodeBuild project
    checks.push(await this.validateCodeBuildProject(environment));

    // Validate IAM roles
    checks.push(await this.validateIAMRoles(environment));

    // Validate secrets
    checks.push(await this.validateSecrets(environment));

    const passedChecks = checks.filter((c) => c.passed).length;
    const totalChecks = checks.length;
    const success = passedChecks === totalChecks;

    const summary = success
      ? `✓ All ${totalChecks} validation checks passed`
      : `✗ ${passedChecks}/${totalChecks} validation checks passed`;

    return {
      success,
      checks,
      summary,
    };
  }

  /**
   * Validates CloudFormation stacks are deployed
   */
  private async validateStacks(environment: string): Promise<ValidationCheck> {
    try {
      const stackNames = [
        'KiroWorkerCore',
        'KiroWorkerSecrets',
        'KiroWorkerPoller',
        'KiroWorkerCodeBuild',
        'KiroWorkerMonitoring',
      ];

      const deployedStacks: string[] = [];
      const missingStacks: string[] = [];

      for (const stackName of stackNames) {
        try {
          const command = new DescribeStacksCommand({ StackName: stackName });
          const response = await this.cfnClient.send(command);

          if (
            response.Stacks &&
            response.Stacks.length > 0 &&
            response.Stacks[0].StackStatus?.includes('COMPLETE')
          ) {
            deployedStacks.push(stackName);
          } else {
            missingStacks.push(stackName);
          }
        } catch (error) {
          missingStacks.push(stackName);
        }
      }

      const passed = missingStacks.length === 0;
      const message = passed
        ? `All ${deployedStacks.length} stacks deployed successfully`
        : `Missing stacks: ${missingStacks.join(', ')}`;

      return {
        name: 'CloudFormation Stacks',
        passed,
        message,
        details: { deployedStacks, missingStacks },
      };
    } catch (error) {
      return {
        name: 'CloudFormation Stacks',
        passed: false,
        message: `Error validating stacks: ${error}`,
      };
    }
  }

  /**
   * Validates S3 artifacts bucket exists
   */
  private async validateS3Bucket(environment: string): Promise<ValidationCheck> {
    try {
      // Get bucket name from stack outputs
      const bucketName = await this.getStackOutput(
        'KiroWorkerCore',
        'ArtifactsBucketName'
      );

      if (!bucketName) {
        return {
          name: 'S3 Artifacts Bucket',
          passed: false,
          message: 'Bucket name not found in stack outputs',
        };
      }

      const command = new HeadBucketCommand({ Bucket: bucketName });
      await this.s3Client.send(command);

      return {
        name: 'S3 Artifacts Bucket',
        passed: true,
        message: `Bucket ${bucketName} exists and is accessible`,
        details: { bucketName },
      };
    } catch (error) {
      return {
        name: 'S3 Artifacts Bucket',
        passed: false,
        message: `Error validating S3 bucket: ${error}`,
      };
    }
  }

  /**
   * Validates DynamoDB locks table exists
   */
  private async validateDynamoDBTable(
    environment: string
  ): Promise<ValidationCheck> {
    try {
      const tableName = await this.getStackOutput(
        'KiroWorkerCore',
        'LocksTableName'
      );

      if (!tableName) {
        return {
          name: 'DynamoDB Locks Table',
          passed: false,
          message: 'Table name not found in stack outputs',
        };
      }

      const command = new DescribeTableCommand({ TableName: tableName });
      const response = await this.dynamoClient.send(command);

      const passed = response.Table?.TableStatus === 'ACTIVE';
      const message = passed
        ? `Table ${tableName} is active`
        : `Table ${tableName} status: ${response.Table?.TableStatus}`;

      return {
        name: 'DynamoDB Locks Table',
        passed,
        message,
        details: { tableName, status: response.Table?.TableStatus },
      };
    } catch (error) {
      return {
        name: 'DynamoDB Locks Table',
        passed: false,
        message: `Error validating DynamoDB table: ${error}`,
      };
    }
  }

  /**
   * Validates Lambda poller function exists
   */
  private async validateLambdaFunction(
    environment: string
  ): Promise<ValidationCheck> {
    try {
      const functionName = await this.getStackOutput(
        'KiroWorkerPoller',
        'PollerFunctionName'
      );

      if (!functionName) {
        return {
          name: 'Lambda Poller Function',
          passed: false,
          message: 'Function name not found in stack outputs',
        };
      }

      const command = new GetFunctionCommand({ FunctionName: functionName });
      const response = await this.lambdaClient.send(command);

      const passed = response.Configuration?.State === 'Active';
      const message = passed
        ? `Function ${functionName} is active`
        : `Function ${functionName} state: ${response.Configuration?.State}`;

      return {
        name: 'Lambda Poller Function',
        passed,
        message,
        details: {
          functionName,
          state: response.Configuration?.State,
          runtime: response.Configuration?.Runtime,
        },
      };
    } catch (error) {
      return {
        name: 'Lambda Poller Function',
        passed: false,
        message: `Error validating Lambda function: ${error}`,
      };
    }
  }

  /**
   * Validates CodeBuild project exists
   */
  private async validateCodeBuildProject(
    environment: string
  ): Promise<ValidationCheck> {
    try {
      const projectName = await this.getStackOutput(
        'KiroWorkerCodeBuild',
        'ProjectName'
      );

      if (!projectName) {
        return {
          name: 'CodeBuild Project',
          passed: false,
          message: 'Project name not found in stack outputs',
        };
      }

      const command = new BatchGetProjectsCommand({ names: [projectName] });
      const response = await this.codeBuildClient.send(command);

      const passed =
        response.projects && response.projects.length > 0;
      const message = passed
        ? `Project ${projectName} exists`
        : `Project ${projectName} not found`;

      return {
        name: 'CodeBuild Project',
        passed,
        message,
        details: { projectName },
      };
    } catch (error) {
      return {
        name: 'CodeBuild Project',
        passed: false,
        message: `Error validating CodeBuild project: ${error}`,
      };
    }
  }

  /**
   * Validates IAM roles exist
   */
  private async validateIAMRoles(environment: string): Promise<ValidationCheck> {
    try {
      const roles = [
        `KiroWorkerCodeBuildRole-${environment}`,
        `KiroWorkerPollerRole-${environment}`,
      ];

      const existingRoles: string[] = [];
      const missingRoles: string[] = [];

      for (const roleName of roles) {
        try {
          const command = new GetRoleCommand({ RoleName: roleName });
          await this.iamClient.send(command);
          existingRoles.push(roleName);
        } catch (error) {
          missingRoles.push(roleName);
        }
      }

      const passed = missingRoles.length === 0;
      const message = passed
        ? `All ${existingRoles.length} IAM roles exist`
        : `Missing roles: ${missingRoles.join(', ')}`;

      return {
        name: 'IAM Roles',
        passed,
        message,
        details: { existingRoles, missingRoles },
      };
    } catch (error) {
      return {
        name: 'IAM Roles',
        passed: false,
        message: `Error validating IAM roles: ${error}`,
      };
    }
  }

  /**
   * Validates secrets exist (but doesn't check values)
   */
  private async validateSecrets(environment: string): Promise<ValidationCheck> {
    try {
      const secrets = [
        `kiro-worker-${environment}-github-token`,
        `kiro-worker-${environment}-git-credentials`,
      ];

      const existingSecrets: string[] = [];
      const missingSecrets: string[] = [];

      for (const secretName of secrets) {
        try {
          const command = new DescribeSecretCommand({ SecretId: secretName });
          await this.secretsClient.send(command);
          existingSecrets.push(secretName);
        } catch (error) {
          missingSecrets.push(secretName);
        }
      }

      const passed = missingSecrets.length === 0;
      const message = passed
        ? `All ${existingSecrets.length} secrets exist (values not validated)`
        : `Missing secrets: ${missingSecrets.join(', ')}`;

      return {
        name: 'Secrets Manager Secrets',
        passed,
        message,
        details: { existingSecrets, missingSecrets },
      };
    } catch (error) {
      return {
        name: 'Secrets Manager Secrets',
        passed: false,
        message: `Error validating secrets: ${error}`,
      };
    }
  }

  /**
   * Tests Lambda function invocation
   */
  async testLambdaInvocation(environment: string): Promise<ValidationCheck> {
    try {
      const functionName = await this.getStackOutput(
        'KiroWorkerPoller',
        'PollerFunctionName'
      );

      if (!functionName) {
        return {
          name: 'Lambda Test Invocation',
          passed: false,
          message: 'Function name not found',
        };
      }

      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'DryRun',
      });

      await this.lambdaClient.send(command);

      return {
        name: 'Lambda Test Invocation',
        passed: true,
        message: `Function ${functionName} can be invoked`,
        details: { functionName },
      };
    } catch (error) {
      return {
        name: 'Lambda Test Invocation',
        passed: false,
        message: `Error testing Lambda invocation: ${error}`,
      };
    }
  }

  /**
   * Generates deployment report
   */
  async generateDeploymentReport(
    environment: string
  ): Promise<DeploymentReport> {
    const validationResult = await this.validateDeployment(environment);
    const deployedResources = await this.getDeployedResources(environment);

    const nextSteps = [
      'Populate GitHub token in Secrets Manager',
      'Populate Git credentials in Secrets Manager',
      'Configure GitHub Project settings in Parameter Store',
      'Subscribe email addresses to SNS topics',
      'Test Lambda function with real credentials',
      'Create feature branch with spec files',
      'Add work item to GitHub Project',
    ];

    return {
      environment,
      timestamp: new Date().toISOString(),
      validationResult,
      deployedResources,
      nextSteps,
    };
  }

  /**
   * Gets list of deployed resources
   */
  private async getDeployedResources(
    environment: string
  ): Promise<DeployedResource[]> {
    const resources: DeployedResource[] = [];

    try {
      // Get S3 bucket
      const bucketName = await this.getStackOutput(
        'KiroWorkerCore',
        'ArtifactsBucketName'
      );
      if (bucketName) {
        resources.push({
          type: 'S3 Bucket',
          name: bucketName,
          arn: `arn:aws:s3:::${bucketName}`,
          status: 'Active',
        });
      }

      // Get DynamoDB table
      const tableName = await this.getStackOutput(
        'KiroWorkerCore',
        'LocksTableName'
      );
      if (tableName) {
        resources.push({
          type: 'DynamoDB Table',
          name: tableName,
          status: 'Active',
        });
      }

      // Get Lambda function
      const functionName = await this.getStackOutput(
        'KiroWorkerPoller',
        'PollerFunctionName'
      );
      if (functionName) {
        resources.push({
          type: 'Lambda Function',
          name: functionName,
          status: 'Active',
        });
      }

      // Get CodeBuild project
      const projectName = await this.getStackOutput(
        'KiroWorkerCodeBuild',
        'ProjectName'
      );
      if (projectName) {
        resources.push({
          type: 'CodeBuild Project',
          name: projectName,
          status: 'Active',
        });
      }
    } catch (error) {
      console.error('Error getting deployed resources:', error);
    }

    return resources;
  }

  /**
   * Gets stack output value
   */
  private async getStackOutput(
    stackName: string,
    outputKey: string
  ): Promise<string | undefined> {
    try {
      const command = new DescribeStacksCommand({ StackName: stackName });
      const response = await this.cfnClient.send(command);

      if (!response.Stacks || response.Stacks.length === 0) {
        return undefined;
      }

      const stack = response.Stacks[0];
      const output = stack.Outputs?.find((o) => o.OutputKey === outputKey);
      return output?.OutputValue;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Formats deployment report as text
   */
  formatDeploymentReport(report: DeploymentReport): string {
    let output = '';

    output += 'Kiro CodeBuild Worker - Post-Deployment Validation Report\n';
    output += '==========================================================\n\n';
    output += `Environment: ${report.environment}\n`;
    output += `Timestamp: ${report.timestamp}\n\n`;

    output += 'Validation Results:\n';
    output += '-------------------\n';
    output += `${report.validationResult.summary}\n\n`;

    for (const check of report.validationResult.checks) {
      const icon = check.passed ? '✓' : '✗';
      output += `${icon} ${check.name}: ${check.message}\n`;
    }

    output += '\nDeployed Resources:\n';
    output += '-------------------\n';
    for (const resource of report.deployedResources) {
      output += `- ${resource.type}: ${resource.name}\n`;
      if (resource.arn) {
        output += `  ARN: ${resource.arn}\n`;
      }
    }

    output += '\nNext Steps:\n';
    output += '-----------\n';
    for (let i = 0; i < report.nextSteps.length; i++) {
      output += `${i + 1}. ${report.nextSteps[i]}\n`;
    }

    output += '\nFor detailed instructions, see docs/deployment/DEPLOYMENT.md\n';

    return output;
  }
}
