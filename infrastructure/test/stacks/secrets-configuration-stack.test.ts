/**
 * Unit tests for SecretsConfigurationStack
 * 
 * Tests verify:
 * - KMS key creation with proper configuration
 * - Secrets Manager secrets creation with encryption
 * - Parameter Store parameters creation
 * - CloudFormation outputs
 * - Resource tagging
 * - Security configurations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SecretsConfigurationStack } from '../../lib/stacks/secrets-configuration-stack';
import { EnvironmentConfig } from '../../lib/config/environments';

describe('SecretsConfigurationStack', () => {
  let app: cdk.App;
  let stack: SecretsConfigurationStack;
  let template: Template;
  let testConfig: EnvironmentConfig;

  beforeEach(() => {
    app = new cdk.App();
    testConfig = {
      account: '123456789012',
      region: 'us-east-1',
      environment: 'test',
      coverageThreshold: 80,
      pollingInterval: 'rate(5 minutes)',
      codeBuildComputeType: 'SMALL',
      codeBuildTimeout: 60,
      lambdaTimeout: 15,
      lockTTLHours: 2,
      artifactRetentionDays: 30,
      logRetentionDays: 7,
    };
    
    stack = new SecretsConfigurationStack(app, 'TestSecretsStack', {
      config: testConfig,
      env: {
        account: testConfig.account,
        region: testConfig.region,
      },
    });
    
    template = Template.fromStack(stack);
  });

  describe('KMS Key', () => {
    it('should create KMS key with correct alias', () => {
      template.hasResourceProperties('AWS::KMS::Alias', {
        AliasName: 'alias/kiro-worker-test-secrets',
      });
    });

    it('should enable key rotation', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });

    it('should have correct key policy for root account', () => {
      // Check that the key policy allows root account access
      template.hasResourceProperties('AWS::KMS::Key', {
        KeyPolicy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'kms:*',
              Resource: '*',
              Principal: Match.objectLike({
                AWS: Match.anyValue(),
              }),
            }),
          ]),
        }),
      });
    });

    it('should allow Secrets Manager to use the key', () => {
      // Check that the key policy includes Secrets Manager permissions
      const templateJson = template.toJSON();
      const kmsKey = Object.values(templateJson.Resources).find(
        (r: any) => r.Type === 'AWS::KMS::Key'
      ) as any;
      
      expect(kmsKey).toBeDefined();
      const statements = kmsKey.Properties.KeyPolicy.Statement;
      const secretsManagerStatement = statements.find(
        (s: any) => s.Principal?.Service === 'secretsmanager.amazonaws.com'
      );
      
      expect(secretsManagerStatement).toBeDefined();
      expect(secretsManagerStatement.Effect).toBe('Allow');
      expect(secretsManagerStatement.Action).toContain('kms:Decrypt');
      expect(secretsManagerStatement.Action).toContain('kms:DescribeKey');
    });

    it('should allow Systems Manager to use the key', () => {
      // Check that the key policy includes Systems Manager permissions
      const templateJson = template.toJSON();
      const kmsKey = Object.values(templateJson.Resources).find(
        (r: any) => r.Type === 'AWS::KMS::Key'
      ) as any;
      
      expect(kmsKey).toBeDefined();
      const statements = kmsKey.Properties.KeyPolicy.Statement;
      const ssmStatement = statements.find(
        (s: any) => s.Principal?.Service === 'ssm.amazonaws.com'
      );
      
      expect(ssmStatement).toBeDefined();
      expect(ssmStatement.Effect).toBe('Allow');
      expect(ssmStatement.Action).toContain('kms:Decrypt');
      expect(ssmStatement.Action).toContain('kms:DescribeKey');
    });

    it('should have correct tags', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security' },
          { Key: 'Purpose', Value: 'SecretsEncryption' },
        ]),
      });
    });
  });

  describe('Git Credentials Secret', () => {
    it('should create Git credentials secret with correct name', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-git-credentials',
        Description: 'Git repository credentials for Kiro Worker test environment',
      });
    });

    it('should encrypt Git credentials secret with KMS key', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-git-credentials',
        KmsKeyId: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('SecretsKMSKey'),
            'Arn',
          ]),
        }),
      });
    });

    it('should have placeholder value for Git credentials', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-git-credentials',
        SecretString: Match.stringLikeRegexp('PLACEHOLDER'),
      });
    });

    it('should have correct tags for Git credentials secret', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-git-credentials',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security' },
          { Key: 'Purpose', Value: 'GitCredentials' },
        ]),
      });
    });
  });

  describe('GitHub Token Secret', () => {
    it('should create GitHub token secret with correct name', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-github-token',
        Description: 'GitHub API token for Kiro Worker test environment',
      });
    });

    it('should encrypt GitHub token secret with KMS key', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-github-token',
        KmsKeyId: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('SecretsKMSKey'),
            'Arn',
          ]),
        }),
      });
    });

    it('should have placeholder value for GitHub token', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-github-token',
        SecretString: Match.stringLikeRegexp('ghp_PLACEHOLDER'),
      });
    });

    it('should have correct tags for GitHub token secret', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-github-token',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security' },
          { Key: 'Purpose', Value: 'GitHubAPI' },
        ]),
      });
    });
  });

  describe('GitLab Token Secret', () => {
    it('should create GitLab token secret with correct name', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-gitlab-token',
        Description: Match.stringLikeRegexp('GitLab.*optional'),
      });
    });

    it('should encrypt GitLab token secret with KMS key', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-gitlab-token',
        KmsKeyId: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('SecretsKMSKey'),
            'Arn',
          ]),
        }),
      });
    });

    it('should have placeholder value for GitLab token', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-gitlab-token',
        SecretString: Match.stringLikeRegexp('glpat-PLACEHOLDER'),
      });
    });

    it('should have correct tags for GitLab token secret', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-test-gitlab-token',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Security' },
          { Key: 'Purpose', Value: 'GitLabAPI' },
        ]),
      });
    });
  });

  describe('GitHub Project Configuration Parameter', () => {
    it('should create GitHub Project config parameter with correct name', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/test/github-project-config',
        Description: 'GitHub Project configuration for Kiro Worker test environment',
      });
    });

    it('should use standard tier for parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/test/github-project-config',
        Tier: 'Standard',
      });
    });

    it('should have JSON configuration value with placeholders', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/test/github-project-config',
        Value: Match.stringLikeRegexp('PLACEHOLDER_ORG'),
      });
    });

    it('should include target status column in configuration', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/test/github-project-config',
        Value: Match.stringLikeRegexp('For Implementation'),
      });
    });

    it('should have correct tags for GitHub Project config parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/test/github-project-config',
        Tags: Match.objectLike({
          Component: 'Configuration',
          Purpose: 'GitHubProject',
        }),
      });
    });
  });

  describe('Resource Counts', () => {
    it('should create exactly one KMS key', () => {
      template.resourceCountIs('AWS::KMS::Key', 1);
    });

    it('should create exactly one KMS alias', () => {
      template.resourceCountIs('AWS::KMS::Alias', 1);
    });

    it('should create exactly three Secrets Manager secrets', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 3);
    });

    it('should create exactly one SSM parameter', () => {
      template.resourceCountIs('AWS::SSM::Parameter', 1);
    });
  });

  describe('CloudFormation Outputs', () => {
    it('should export KMS key ID', () => {
      template.hasOutput('KMSKeyId', {
        Description: 'ID of the KMS key for secrets encryption',
        Export: {
          Name: 'TestSecretsStack-KMSKeyId',
        },
      });
    });

    it('should export KMS key ARN', () => {
      template.hasOutput('KMSKeyArn', {
        Description: 'ARN of the KMS key for secrets encryption',
        Export: {
          Name: 'TestSecretsStack-KMSKeyArn',
        },
      });
    });

    it('should export Git credentials secret name', () => {
      template.hasOutput('GitCredentialsSecretName', {
        Description: Match.stringLikeRegexp('POPULATE AFTER DEPLOYMENT'),
        Export: {
          Name: 'TestSecretsStack-GitCredentialsSecretName',
        },
      });
    });

    it('should export Git credentials secret ARN', () => {
      template.hasOutput('GitCredentialsSecretArn', {
        Description: 'ARN of the Git credentials secret',
        Export: {
          Name: 'TestSecretsStack-GitCredentialsSecretArn',
        },
      });
    });

    it('should export GitHub token secret name', () => {
      template.hasOutput('GitHubTokenSecretName', {
        Description: Match.stringLikeRegexp('POPULATE AFTER DEPLOYMENT'),
        Export: {
          Name: 'TestSecretsStack-GitHubTokenSecretName',
        },
      });
    });

    it('should export GitHub token secret ARN', () => {
      template.hasOutput('GitHubTokenSecretArn', {
        Description: 'ARN of the GitHub API token secret',
        Export: {
          Name: 'TestSecretsStack-GitHubTokenSecretArn',
        },
      });
    });

    it('should export GitLab token secret name', () => {
      template.hasOutput('GitLabTokenSecretName', {
        Description: Match.stringLikeRegexp('OPTIONAL'),
        Export: {
          Name: 'TestSecretsStack-GitLabTokenSecretName',
        },
      });
    });

    it('should export GitLab token secret ARN', () => {
      template.hasOutput('GitLabTokenSecretArn', {
        Description: 'ARN of the GitLab API token secret',
        Export: {
          Name: 'TestSecretsStack-GitLabTokenSecretArn',
        },
      });
    });

    it('should export GitHub Project config parameter name', () => {
      template.hasOutput('GitHubProjectConfigParameterName', {
        Description: Match.stringLikeRegexp('POPULATE AFTER DEPLOYMENT'),
        Export: {
          Name: 'TestSecretsStack-GitHubProjectConfigParameterName',
        },
      });
    });

    it('should export GitHub Project config parameter ARN', () => {
      template.hasOutput('GitHubProjectConfigParameterArn', {
        Description: 'ARN of the GitHub Project configuration parameter',
        Export: {
          Name: 'TestSecretsStack-GitHubProjectConfigParameterArn',
        },
      });
    });

    it('should include post-deployment instructions', () => {
      template.hasOutput('PostDeploymentInstructions', {
        Description: 'Next steps after deployment',
        Value: Match.stringLikeRegexp('IMPORTANT.*Update secrets'),
      });
    });
  });

  describe('Multi-Environment Support', () => {
    it('should create resources with staging environment naming', () => {
      const stagingApp = new cdk.App();
      const stagingConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'staging',
      };
      
      const stagingStack = new SecretsConfigurationStack(stagingApp, 'StagingSecretsStack', {
        config: stagingConfig,
        env: {
          account: stagingConfig.account,
          region: stagingConfig.region,
        },
      });
      
      const stagingTemplate = Template.fromStack(stagingStack);
      
      stagingTemplate.hasResourceProperties('AWS::KMS::Alias', {
        AliasName: 'alias/kiro-worker-staging-secrets',
      });
      
      stagingTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-staging-git-credentials',
      });
      
      stagingTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-staging-github-token',
      });
      
      stagingTemplate.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/staging/github-project-config',
      });
    });

    it('should create resources with production environment naming', () => {
      const prodApp = new cdk.App();
      const prodConfig: EnvironmentConfig = {
        ...testConfig,
        environment: 'production',
      };
      
      const prodStack = new SecretsConfigurationStack(prodApp, 'ProdSecretsStack', {
        config: prodConfig,
        env: {
          account: prodConfig.account,
          region: prodConfig.region,
        },
      });
      
      const prodTemplate = Template.fromStack(prodStack);
      
      prodTemplate.hasResourceProperties('AWS::KMS::Alias', {
        AliasName: 'alias/kiro-worker-production-secrets',
      });
      
      prodTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-production-git-credentials',
      });
      
      prodTemplate.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'kiro-worker-production-github-token',
      });
      
      prodTemplate.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/kiro-worker/production/github-project-config',
      });
    });
  });

  describe('Public Properties', () => {
    it('should expose KMS key as public property', () => {
      expect(stack.kmsKey).toBeDefined();
      expect(stack.kmsKey.keyId).toBeDefined();
      expect(stack.kmsKey.keyArn).toBeDefined();
    });

    it('should expose Git credentials secret as public property', () => {
      expect(stack.gitCredentialsSecret).toBeDefined();
      // Secret name is a token in CDK, so we check it's defined
      expect(stack.gitCredentialsSecret.secretName).toBeDefined();
      expect(stack.gitCredentialsSecret.secretArn).toBeDefined();
    });

    it('should expose GitHub token secret as public property', () => {
      expect(stack.githubTokenSecret).toBeDefined();
      // Secret name is a token in CDK, so we check it's defined
      expect(stack.githubTokenSecret.secretName).toBeDefined();
      expect(stack.githubTokenSecret.secretArn).toBeDefined();
    });

    it('should expose GitLab token secret as public property', () => {
      expect(stack.gitlabTokenSecret).toBeDefined();
      // Secret name is a token in CDK, so we check it's defined
      expect(stack.gitlabTokenSecret.secretName).toBeDefined();
      expect(stack.gitlabTokenSecret.secretArn).toBeDefined();
    });

    it('should expose GitHub Project config parameter as public property', () => {
      expect(stack.githubProjectConfigParameter).toBeDefined();
      // Parameter name is a token in CDK, so we check it's defined
      expect(stack.githubProjectConfigParameter.parameterName).toBeDefined();
      expect(stack.githubProjectConfigParameter.parameterArn).toBeDefined();
    });
  });

  describe('Snapshot Test', () => {
    it('should match CloudFormation template snapshot', () => {
      const templateJson = template.toJSON();
      expect(templateJson).toMatchSnapshot();
    });
  });
});
