# Secrets Setup Script Documentation

## Overview

The `setup-secrets.sh` script creates placeholder secrets in AWS Secrets Manager for the Kiro CD Pipeline. This script is designed to be run once per environment during initial setup.

## Location

```
infrastructure/scripts/setup-secrets.sh
```

## Purpose

This script automates the creation of required and optional secrets for the CD Pipeline:

1. **GitHub Token Secret** (REQUIRED): OAuth token for GitHub API access
2. **Slack Webhook Secret** (OPTIONAL): Webhook URL for Slack notifications

## Prerequisites

- AWS CLI installed and configured
- AWS credentials with permissions to create secrets in Secrets Manager
- Valid ENVIRONMENT variable (test, staging, or production)

## Usage

### Basic Usage

```bash
ENVIRONMENT=test ./scripts/setup-secrets.sh
```

### Supported Environments

- `test`: Test environment
- `staging`: Staging environment
- `production`: Production environment

## Script Behavior

### 1. Environment Validation

The script validates that:
- ENVIRONMENT variable is set
- ENVIRONMENT value is one of: test, staging, production
- AWS CLI is installed
- AWS credentials are configured

### 2. Secret Creation

For each secret, the script:
1. Checks if the secret already exists
2. If exists:
   - Displays the existing secret ARN
   - Checks if it has a configured value (not placeholder)
   - Provides instructions to update if needed
3. If not exists:
   - Creates the secret with a placeholder value
   - Tags the secret with Environment, ManagedBy, and Project tags
   - Displays the new secret ARN
   - Provides instructions to populate with actual value

### 3. Secret Naming Convention

Secrets follow this naming pattern:
```
kiro-pipeline-{environment}-{secret-type}
```

Examples:
- `kiro-pipeline-test-github-token`
- `kiro-pipeline-production-slack-webhook`

## Secrets Created

### GitHub Token Secret (REQUIRED)

**Name**: `kiro-pipeline-{env}-github-token`

**Description**: GitHub OAuth token for Kiro CD Pipeline

**Purpose**: Allows the pipeline to:
- Access GitHub repository
- Trigger webhooks
- Update commit statuses
- Create/update pull requests

**How to Populate**:

1. Create a GitHub Personal Access Token:
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `admin:repo_hook`
   - Copy the generated token

2. Update the secret:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id kiro-pipeline-{env}-github-token \
     --secret-string 'ghp_your_actual_github_token' \
     --region us-east-1
   ```

### Slack Webhook Secret (OPTIONAL)

**Name**: `kiro-pipeline-{env}-slack-webhook`

**Description**: Slack webhook URL for Kiro CD Pipeline notifications

**Purpose**: Enables Slack notifications for:
- Deployment start/success/failure
- Rollback events
- Approval requests

**How to Populate**:

1. Create a Slack Incoming Webhook:
   - Go to: https://api.slack.com/messaging/webhooks
   - Create a new webhook for your workspace
   - Copy the webhook URL

2. Update the secret:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id kiro-pipeline-{env}-slack-webhook \
     --secret-string 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL' \
     --region us-east-1
   ```

## Security Features

### Placeholder Values

The script creates secrets with placeholder values that must be replaced:
- `PLACEHOLDER_GITHUB_TOKEN_REPLACE_ME`
- `PLACEHOLDER_SLACK_WEBHOOK_REPLACE_ME`

This ensures:
- No real secrets are hardcoded in the script
- Secrets must be explicitly populated by authorized users
- Accidental deployment with placeholder values will fail

### Secret Tags

All secrets are tagged with:
- `Environment`: test, staging, or production
- `ManagedBy`: Script
- `Project`: KiroWorker

This enables:
- Easy identification of secrets
- Cost allocation
- Access control policies

### Idempotency

The script is idempotent:
- Running multiple times is safe
- Existing secrets are not overwritten
- Only missing secrets are created

## Output

### Success Output

```
=========================================
  CD Pipeline Secrets Setup Script
=========================================

[INFO] Step 1: Validating environment...
[SUCCESS] Environment validated: test

[INFO] Step 2: Checking AWS CLI...
[SUCCESS] AWS CLI is installed

[INFO] Step 3: Getting AWS account information...
[SUCCESS] AWS Account ID: 123456789012
[SUCCESS] AWS Region: us-east-1

[INFO] Step 4: Creating GitHub token secret...
[INFO] Processing secret: kiro-pipeline-test-github-token...
[INFO] Creating new secret: kiro-pipeline-test-github-token...
[SUCCESS] Secret created successfully: kiro-pipeline-test-github-token
[INFO] Secret ARN: arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-pipeline-test-github-token-AbCdEf
[WARNING] ⚠️  REQUIRED: Update this secret with actual value:
   aws secretsmanager put-secret-value \
     --secret-id kiro-pipeline-test-github-token \
     --secret-string 'YOUR_ACTUAL_VALUE'

[INFO] Step 5: Creating Slack webhook secret (optional)...
[INFO] Processing secret: kiro-pipeline-test-slack-webhook...
[INFO] Creating new secret: kiro-pipeline-test-slack-webhook...
[SUCCESS] Secret created successfully: kiro-pipeline-test-slack-webhook
[INFO] Secret ARN: arn:aws:secretsmanager:us-east-1:123456789012:secret:kiro-pipeline-test-slack-webhook-XyZaBc
[INFO] ℹ️  OPTIONAL: Update this secret if needed:
   aws secretsmanager put-secret-value \
     --secret-id kiro-pipeline-test-slack-webhook \
     --secret-string 'YOUR_ACTUAL_VALUE'

=========================================
  Secrets Setup Summary
=========================================

Environment:       test
AWS Account:       123456789012
AWS Region:        us-east-1

Secrets Created/Verified:
  ✓ kiro-pipeline-test-github-token (REQUIRED)
  ✓ kiro-pipeline-test-slack-webhook (OPTIONAL)

=========================================
  IMPORTANT: Next Steps
=========================================

1. Update GitHub Token Secret (REQUIRED):
   [Detailed instructions...]

2. Update Slack Webhook Secret (OPTIONAL):
   [Detailed instructions...]

3. Verify Secrets:
   [Verification commands...]

4. Deploy Pipeline:
   [Deployment commands...]

[SUCCESS] Secrets setup completed!
=========================================
```

## Error Handling

### Missing ENVIRONMENT Variable

```
[ERROR] ENVIRONMENT variable is not set
[ERROR] Usage: ENVIRONMENT=test ./scripts/setup-secrets.sh
[ERROR] Valid values: test, staging, production
```

Exit code: 1

### Invalid ENVIRONMENT Value

```
[ERROR] Invalid ENVIRONMENT value: invalid
[ERROR] Valid values: test, staging, production
```

Exit code: 1

### AWS CLI Not Installed

```
[ERROR] AWS CLI is not installed
[ERROR] Please install AWS CLI: https://aws.amazon.com/cli/
```

Exit code: 1

### AWS Credentials Not Configured

```
[ERROR] Failed to get AWS account ID
[ERROR] Please configure AWS credentials: aws configure
```

Exit code: 1

### GitHub Token Secret Creation Failed

```
[ERROR] Failed to create secret: kiro-pipeline-test-github-token
[ERROR] Error: [AWS error message]
[ERROR] Failed to create GitHub token secret
```

Exit code: 1

### Slack Webhook Secret Creation Failed (Non-Fatal)

```
[WARNING] Failed to create Slack webhook secret (optional)
[WARNING] You can create this manually later if needed
```

Exit code: 0 (continues execution)

## Verification

After running the script, verify secrets were created:

```bash
# List all pipeline secrets for the environment
aws secretsmanager list-secrets \
  --region us-east-1 \
  --filters Key=name,Values=kiro-pipeline-test

# Describe a specific secret
aws secretsmanager describe-secret \
  --secret-id kiro-pipeline-test-github-token \
  --region us-east-1

# Get secret value (to verify it's been populated)
aws secretsmanager get-secret-value \
  --secret-id kiro-pipeline-test-github-token \
  --region us-east-1 \
  --query SecretString \
  --output text
```

## Integration with Deployment

This script should be run before deploying the CD Pipeline:

```bash
# 1. Setup secrets
ENVIRONMENT=test ./scripts/setup-secrets.sh

# 2. Populate GitHub token (REQUIRED)
aws secretsmanager put-secret-value \
  --secret-id kiro-pipeline-test-github-token \
  --secret-string 'ghp_your_actual_token'

# 3. Deploy pipeline
ENVIRONMENT=test ./deploy-pipeline.sh
```

## Troubleshooting

### Secret Already Exists

If the secret already exists, the script will:
1. Display the existing secret ARN
2. Check if it has a configured value
3. Provide instructions to update if needed

This is normal and safe. The script will not overwrite existing secrets.

### Permission Denied

If you get permission errors:
1. Verify your AWS credentials have `secretsmanager:CreateSecret` permission
2. Verify your AWS credentials have `secretsmanager:DescribeSecret` permission
3. Verify your AWS credentials have `secretsmanager:TagResource` permission

Required IAM permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:TagResource"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:kiro-pipeline-*"
    }
  ]
}
```

### Region Mismatch

Ensure the AWS region matches your pipeline deployment region:
```bash
aws configure get region
```

If needed, set the region:
```bash
aws configure set region us-east-1
```

## Best Practices

1. **Run Once Per Environment**: This script only needs to be run once per environment during initial setup

2. **Populate Secrets Immediately**: After creating secrets, populate them with actual values before deploying the pipeline

3. **Rotate Secrets Regularly**: GitHub tokens and Slack webhooks should be rotated periodically

4. **Use Least Privilege**: GitHub tokens should have only the required scopes (repo, admin:repo_hook)

5. **Verify Before Deployment**: Always verify secrets are populated before deploying the pipeline

6. **Document Secret Owners**: Maintain documentation of who created/owns each secret

7. **Monitor Secret Usage**: Use CloudWatch to monitor secret access patterns

## Related Documentation

- [Deployment Script Documentation](./deploy-pipeline-script.md)
- [Validation Script Documentation](./validate-deployment-script.md)
- [CD Pipeline Deployment Guide](../deployment/cd-pipeline-deployment.md)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)

## Testing

The script is tested via static analysis in:
```
infrastructure/test/scripts/setup-secrets.test.ts
```

Tests validate:
- Script existence and permissions
- Error handling
- Logging functions
- Secret creation logic
- Security best practices
- Documentation completeness

Run tests:
```bash
cd infrastructure
npm test -- test/scripts/setup-secrets.test.ts
```

## Maintenance

When updating this script:
1. Update the corresponding test file
2. Update this documentation
3. Test in all three environments (test, staging, production)
4. Verify idempotency (run multiple times)
5. Verify error handling (test failure scenarios)

## Support

For issues or questions:
1. Check CloudWatch logs for AWS API errors
2. Verify AWS credentials and permissions
3. Review this documentation
4. Contact the DevOps team
