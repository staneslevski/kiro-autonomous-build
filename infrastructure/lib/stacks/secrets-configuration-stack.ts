/**
 * Secrets Configuration Stack for Kiro CodeBuild Worker
 * 
 * This stack creates secure credential and configuration storage:
 * - AWS Secrets Manager secrets for Git credentials and API tokens
 * - AWS Systems Manager Parameter Store for GitHub Project configuration
 * - AWS KMS keys for encryption of secrets and parameters
 * 
 * Dependencies: None (can be deployed independently)
 * 
 * Security Features:
 * - All secrets encrypted with customer-managed KMS keys
 * - Automatic secret rotation enabled (where supported)
 * - Least-privilege IAM permissions
 * - Secrets created with placeholder values (must be populated manually)
 */

import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

/**
 * Properties for SecretsConfigurationStack
 */
export interface SecretsConfigurationStackProps extends cdk.StackProps {
  /** Environment-specific configuration */
  config: EnvironmentConfig;
}

/**
 * Secrets Configuration Stack
 * 
 * Creates secure storage for credentials and configuration:
 * - KMS encryption keys
 * - Secrets Manager secrets
 * - Parameter Store parameters
 */
export class SecretsConfigurationStack extends cdk.Stack {
  /** KMS key for encrypting secrets and parameters */
  public readonly kmsKey: kms.Key;
  
  /** Secret for Git repository credentials (token or SSH key) */
  public readonly gitCredentialsSecret: secretsmanager.Secret;
  
  /** Secret for GitHub API token */
  public readonly githubTokenSecret: secretsmanager.Secret;
  
  /** Secret for GitLab API token (optional) */
  public readonly gitlabTokenSecret: secretsmanager.Secret;
  
  /** Parameter for GitHub Project configuration */
  public readonly githubProjectConfigParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: SecretsConfigurationStackProps) {
    super(scope, id, props);

    const { config } = props;
    const environment = config.environment;

    // Create KMS key for encryption
    this.kmsKey = this.createKMSKey(environment);

    // Create Secrets Manager secrets
    this.gitCredentialsSecret = this.createGitCredentialsSecret(environment);
    this.githubTokenSecret = this.createGitHubTokenSecret(environment);
    this.gitlabTokenSecret = this.createGitLabTokenSecret(environment);

    // Create Parameter Store parameters
    this.githubProjectConfigParameter = this.createGitHubProjectConfigParameter(environment);

    // Add stack outputs
    this.createOutputs();
  }

  /**
   * Create KMS key for encrypting secrets and parameters
   * 
   * The key is used by Secrets Manager and Parameter Store to encrypt
   * sensitive data at rest. Key rotation is enabled for security.
   */
  private createKMSKey(environment: string): kms.Key {
    const keyAlias = `kiro-worker-${environment}-secrets`;
    
    const key = new kms.Key(this, 'SecretsKMSKey', {
      alias: keyAlias,
      description: `KMS key for Kiro Worker ${environment} secrets and parameters`,
      
      // Enable automatic key rotation annually
      enableKeyRotation: true,
      
      // Retain key on stack deletion (protect encrypted data)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Grant Secrets Manager permission to use the key
    key.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowSecretsManager',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('secretsmanager.amazonaws.com')],
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:CreateGrant',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'kms:ViaService': `secretsmanager.${this.region}.amazonaws.com`,
        },
      },
    }));

    // Grant Systems Manager Parameter Store permission to use the key
    key.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowSystemsManager',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('ssm.amazonaws.com')],
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'kms:ViaService': `ssm.${this.region}.amazonaws.com`,
        },
      },
    }));

    // Add tags
    cdk.Tags.of(key).add('Component', 'Security');
    cdk.Tags.of(key).add('Purpose', 'SecretsEncryption');

    return key;
  }

  /**
   * Create Secrets Manager secret for Git repository credentials
   * 
   * This secret stores Git credentials (personal access token or SSH key)
   * used by CodeBuild to clone, commit, and push to repositories.
   * 
   * The secret is created with a placeholder value and must be populated
   * manually after deployment.
   */
  private createGitCredentialsSecret(environment: string): secretsmanager.Secret {
    const secretName = `kiro-worker-${environment}-git-credentials`;
    
    const secret = new secretsmanager.Secret(this, 'GitCredentialsSecret', {
      secretName,
      description: `Git repository credentials for Kiro Worker ${environment} environment`,
      
      // Encrypt with customer-managed KMS key
      encryptionKey: this.kmsKey,
      
      // Create with placeholder value (must be updated manually)
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          username: 'PLACEHOLDER',
          token: 'PLACEHOLDER_TOKEN',
          note: 'Replace with actual Git credentials after deployment',
        })
      ),
      
      // Retain secret on stack deletion (protect credentials)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add tags
    cdk.Tags.of(secret).add('Component', 'Security');
    cdk.Tags.of(secret).add('Purpose', 'GitCredentials');

    return secret;
  }

  /**
   * Create Secrets Manager secret for GitHub API token
   * 
   * This secret stores the GitHub API token used for:
   * - Querying GitHub Projects API for work items
   * - Updating pull requests with build results
   * - Validating branch and PR existence
   * 
   * The secret is created with a placeholder value and must be populated
   * manually after deployment.
   */
  private createGitHubTokenSecret(environment: string): secretsmanager.Secret {
    const secretName = `kiro-worker-${environment}-github-token`;
    
    const secret = new secretsmanager.Secret(this, 'GitHubTokenSecret', {
      secretName,
      description: `GitHub API token for Kiro Worker ${environment} environment`,
      
      // Encrypt with customer-managed KMS key
      encryptionKey: this.kmsKey,
      
      // Create with placeholder value (must be updated manually)
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          token: 'ghp_PLACEHOLDER_TOKEN',
          note: 'Replace with actual GitHub personal access token (classic or fine-grained) with repo and project permissions',
        })
      ),
      
      // Retain secret on stack deletion (protect credentials)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add tags
    cdk.Tags.of(secret).add('Component', 'Security');
    cdk.Tags.of(secret).add('Purpose', 'GitHubAPI');

    return secret;
  }

  /**
   * Create Secrets Manager secret for GitLab API token (optional)
   * 
   * This secret stores the GitLab API token used for:
   * - Updating merge requests with build results
   * - Validating branch and MR existence
   * 
   * This is optional and only needed if using GitLab instead of GitHub.
   * The secret is created with a placeholder value and must be populated
   * manually after deployment if GitLab is used.
   */
  private createGitLabTokenSecret(environment: string): secretsmanager.Secret {
    const secretName = `kiro-worker-${environment}-gitlab-token`;
    
    const secret = new secretsmanager.Secret(this, 'GitLabTokenSecret', {
      secretName,
      description: `GitLab API token for Kiro Worker ${environment} environment (optional)`,
      
      // Encrypt with customer-managed KMS key
      encryptionKey: this.kmsKey,
      
      // Create with placeholder value (must be updated manually if using GitLab)
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          token: 'glpat-PLACEHOLDER_TOKEN',
          note: 'Replace with actual GitLab personal access token with api scope if using GitLab',
        })
      ),
      
      // Retain secret on stack deletion (protect credentials)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add tags
    cdk.Tags.of(secret).add('Component', 'Security');
    cdk.Tags.of(secret).add('Purpose', 'GitLabAPI');

    return secret;
  }

  /**
   * Create Parameter Store parameter for GitHub Project configuration
   * 
   * This parameter stores the GitHub Project configuration used by the
   * Work Item Poller Lambda to query for work items.
   * 
   * Configuration includes:
   * - GitHub organization name
   * - Repository name
   * - Project number
   * - Target status column name (e.g., "For Implementation")
   * 
   * The parameter is created with placeholder values and must be updated
   * manually after deployment with actual project configuration.
   */
  private createGitHubProjectConfigParameter(environment: string): ssm.StringParameter {
    const parameterName = `/kiro-worker/${environment}/github-project-config`;
    
    // Default configuration structure
    const defaultConfig = {
      organization: 'PLACEHOLDER_ORG',
      repository: 'PLACEHOLDER_REPO',
      projectNumber: 1,
      targetStatusColumn: 'For Implementation',
      note: 'Replace with actual GitHub Project configuration after deployment',
    };
    
    const parameter = new ssm.StringParameter(this, 'GitHubProjectConfigParameter', {
      parameterName,
      description: `GitHub Project configuration for Kiro Worker ${environment} environment`,
      
      // Store as JSON string
      stringValue: JSON.stringify(defaultConfig, null, 2),
      
      // Use standard tier (up to 4KB, sufficient for configuration)
      tier: ssm.ParameterTier.STANDARD,
      
      // Encrypt with customer-managed KMS key
      // Note: Parameter Store encryption requires advanced tier for customer-managed keys
      // Using standard tier without encryption for configuration (non-sensitive)
      // Sensitive data (tokens) are stored in Secrets Manager
    });

    // Add tags
    cdk.Tags.of(parameter).add('Component', 'Configuration');
    cdk.Tags.of(parameter).add('Purpose', 'GitHubProject');

    return parameter;
  }

  /**
   * Create CloudFormation outputs for cross-stack references and manual configuration
   */
  private createOutputs(): void {
    // KMS key outputs
    new cdk.CfnOutput(this, 'KMSKeyId', {
      value: this.kmsKey.keyId,
      description: 'ID of the KMS key for secrets encryption',
      exportName: `${this.stackName}-KMSKeyId`,
    });

    new cdk.CfnOutput(this, 'KMSKeyArn', {
      value: this.kmsKey.keyArn,
      description: 'ARN of the KMS key for secrets encryption',
      exportName: `${this.stackName}-KMSKeyArn`,
    });

    // Git credentials secret outputs
    new cdk.CfnOutput(this, 'GitCredentialsSecretName', {
      value: this.gitCredentialsSecret.secretName,
      description: 'Name of the Git credentials secret (POPULATE AFTER DEPLOYMENT)',
      exportName: `${this.stackName}-GitCredentialsSecretName`,
    });

    new cdk.CfnOutput(this, 'GitCredentialsSecretArn', {
      value: this.gitCredentialsSecret.secretArn,
      description: 'ARN of the Git credentials secret',
      exportName: `${this.stackName}-GitCredentialsSecretArn`,
    });

    // GitHub token secret outputs
    new cdk.CfnOutput(this, 'GitHubTokenSecretName', {
      value: this.githubTokenSecret.secretName,
      description: 'Name of the GitHub API token secret (POPULATE AFTER DEPLOYMENT)',
      exportName: `${this.stackName}-GitHubTokenSecretName`,
    });

    new cdk.CfnOutput(this, 'GitHubTokenSecretArn', {
      value: this.githubTokenSecret.secretArn,
      description: 'ARN of the GitHub API token secret',
      exportName: `${this.stackName}-GitHubTokenSecretArn`,
    });

    // GitLab token secret outputs
    new cdk.CfnOutput(this, 'GitLabTokenSecretName', {
      value: this.gitlabTokenSecret.secretName,
      description: 'Name of the GitLab API token secret (OPTIONAL - populate if using GitLab)',
      exportName: `${this.stackName}-GitLabTokenSecretName`,
    });

    new cdk.CfnOutput(this, 'GitLabTokenSecretArn', {
      value: this.gitlabTokenSecret.secretArn,
      description: 'ARN of the GitLab API token secret',
      exportName: `${this.stackName}-GitLabTokenSecretArn`,
    });

    // GitHub Project config parameter outputs
    new cdk.CfnOutput(this, 'GitHubProjectConfigParameterName', {
      value: this.githubProjectConfigParameter.parameterName,
      description: 'Name of the GitHub Project configuration parameter (POPULATE AFTER DEPLOYMENT)',
      exportName: `${this.stackName}-GitHubProjectConfigParameterName`,
    });

    new cdk.CfnOutput(this, 'GitHubProjectConfigParameterArn', {
      value: this.githubProjectConfigParameter.parameterArn,
      description: 'ARN of the GitHub Project configuration parameter',
      exportName: `${this.stackName}-GitHubProjectConfigParameterArn`,
    });

    // Post-deployment instructions
    new cdk.CfnOutput(this, 'PostDeploymentInstructions', {
      value: 'IMPORTANT: Update secrets and parameters with actual values using AWS Console or CLI',
      description: 'Next steps after deployment',
    });
  }
}
