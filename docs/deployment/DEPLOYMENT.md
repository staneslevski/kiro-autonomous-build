# Kiro CodeBuild Worker - Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Deployment Steps](#deployment-steps)
5. [Stack Dependencies](#stack-dependencies)
6. [Post-Deployment Configuration](#post-deployment-configuration)
7. [Verification](#verification)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

## Overview

This guide provides step-by-step instructions for deploying the Kiro CodeBuild Worker system to AWS. The deployment uses AWS CDK to provision all required infrastructure across multiple CloudFormation stacks.

### Deployment Architecture

The system consists of 5 independent CDK stacks that must be deployed in order:

1. **Core Infrastructure Stack**: S3 buckets, DynamoDB tables, CloudWatch log groups
2. **Secrets Configuration Stack**: Secrets Manager secrets, KMS keys, Parameter Store parameters
3. **Work Item Poller Stack**: Lambda function, EventBridge scheduled rule, Dead Letter Queue
4. **CodeBuild Projects Stack**: CodeBuild projects for each environment
5. **Monitoring and Alerting Stack**: CloudWatch alarms, SNS topics, notification configuration

### Deployment Time

- **Initial deployment**: 15-20 minutes (all stacks)
- **Individual stack**: 3-5 minutes
- **Updates**: 2-10 minutes depending on changes

## Prerequisites

Before deploying, ensure you have completed all prerequisites. See [prerequisites.md](prerequisites.md) for detailed setup instructions.

### Required Tools

- AWS CLI v2.x or later
- Node.js 18.x or later
- npm 9.x or later
- AWS CDK CLI 2.x or later
- Git

### AWS Account Requirements

- AWS account with appropriate permissions (see [iam-permissions.md](iam-permissions.md))
- AWS region selected (default: us-east-1)
- AWS CLI configured with credentials
- CDK bootstrapped in target account/region

### GitHub Requirements

- GitHub account with Projects API access
- GitHub Personal Access Token with permissions:
  - `repo` (full control of private repositories)
  - `project` (full control of projects)
  - `read:org` (read organization data)
- Existing GitHub Project with work items
- Feature branches with spec files in `.kiro/specs/{branch-name}/`

## Pre-Deployment Checklist

Before starting deployment, verify:

- [ ] AWS CLI is installed and configured
- [ ] AWS credentials have required permissions
- [ ] Node.js 18+ and npm are installed
- [ ] AWS CDK CLI is installed globally
- [ ] GitHub Personal Access Token is created
- [ ] Target AWS region is selected
- [ ] CDK is bootstrapped in target account/region
- [ ] Repository is cloned locally
- [ ] Dependencies are installed (`npm install`)

## Deployment Steps

### Step 1: Clone Repository and Install Dependencies

```bash
# Clone repository
git clone <repository-url>
cd kiro-codebuild-worker

# Install application dependencies
npm install

# Install infrastructure dependencies
cd infrastructure
npm install
```

### Step 2: Configure Environment

Choose your target environment (test, staging, or production):

```bash
export DEPLOY_ENV=test  # or staging, or production
```

### Step 3: Review Environment Configuration

Edit `infrastructure/lib/config/environments.ts` to customize settings:

```typescript
export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  test: {
    account: process.env.CDK_DEFAULT_ACCOUNT!,
    region: 'us-east-1',
    environment: 'test',
    coverageThreshold: 80,
    pollingInterval: 'rate(5 minutes)'
  },
  // ... other environments
};
```

### Step 4: Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this account/region:

```bash
cd infrastructure
cdk bootstrap aws://<account-id>/<region>
```

Example:
```bash
cdk bootstrap aws://123456789012/us-east-1
```

### Step 5: Validate Deployment (Dry Run)

Synthesize CloudFormation templates without deploying:

```bash
cd infrastructure
cdk synth --context environment=$DEPLOY_ENV
```

Review the generated CloudFormation templates in `infrastructure/cdk.out/`.

### Step 6: Deploy All Stacks

Deploy all stacks in the correct order:

```bash
cd infrastructure
cdk deploy --all --context environment=$DEPLOY_ENV --require-approval never
```

Or deploy with approval prompts for security changes:

```bash
cdk deploy --all --context environment=$DEPLOY_ENV
```

**Note**: The `--all` flag deploys stacks in dependency order automatically.

### Step 7: Deploy Individual Stacks (Optional)

To deploy stacks individually in order:

```bash
# 1. Core Infrastructure
cdk deploy KiroWorkerCore --context environment=$DEPLOY_ENV

# 2. Secrets Configuration
cdk deploy KiroWorkerSecrets --context environment=$DEPLOY_ENV

# 3. Work Item Poller
cdk deploy KiroWorkerPoller --context environment=$DEPLOY_ENV

# 4. CodeBuild Projects
cdk deploy KiroWorkerCodeBuild --context environment=$DEPLOY_ENV

# 5. Monitoring and Alerting
cdk deploy KiroWorkerMonitoring --context environment=$DEPLOY_ENV
```

### Step 8: Note Stack Outputs

After deployment, CDK will output important resource ARNs and names. Save these for configuration:

```
Outputs:
KiroWorkerCore.ArtifactsBucketName = kiro-worker-test-artifacts-abc123
KiroWorkerCore.LocksTableName = kiro-worker-test-locks
KiroWorkerSecrets.GitHubTokenSecretArn = arn:aws:secretsmanager:...
KiroWorkerSecrets.GitCredentialsSecretArn = arn:aws:secretsmanager:...
KiroWorkerPoller.PollerFunctionName = kiro-worker-test-poller
KiroWorkerCodeBuild.ProjectName = kiro-worker-test
```

## Stack Dependencies

### Dependency Graph

```
KiroWorkerCore (no dependencies)
    ↓
KiroWorkerSecrets (depends on Core for KMS key)
    ↓
KiroWorkerPoller (depends on Core for DynamoDB table, Secrets for API tokens)
    ↓
KiroWorkerCodeBuild (depends on Core for S3 bucket, Secrets for credentials)
    ↓
KiroWorkerMonitoring (depends on CodeBuild and Poller for metrics)
```

### Stack Details

**KiroWorkerCore**:
- S3 bucket for build artifacts
- DynamoDB table for work item locking
- CloudWatch log groups
- KMS key for encryption
- No dependencies

**KiroWorkerSecrets**:
- Secrets Manager secrets (GitHub token, Git credentials)
- Parameter Store parameters (GitHub Project config)
- Depends on: Core (KMS key)

**KiroWorkerPoller**:
- Lambda function for polling work items
- EventBridge scheduled rule
- SQS Dead Letter Queue
- IAM role with permissions
- Depends on: Core (DynamoDB table), Secrets (API tokens)

**KiroWorkerCodeBuild**:
- CodeBuild projects for each environment
- IAM role with permissions
- Build compute configuration
- Depends on: Core (S3 bucket), Secrets (credentials)

**KiroWorkerMonitoring**:
- CloudWatch alarms for all metrics
- SNS topics for notifications
- Alarm actions
- Depends on: CodeBuild (metrics), Poller (metrics)

## Post-Deployment Configuration

After infrastructure is deployed, configure secrets and parameters:

### Step 1: Populate GitHub Token

```bash
# Get secret ARN from stack outputs
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerSecrets \
  --query 'Stacks[0].Outputs[?OutputKey==`GitHubTokenSecretArn`].OutputValue' \
  --output text)

# Populate secret value
aws secretsmanager put-secret-value \
  --secret-id $SECRET_ARN \
  --secret-string "ghp_your_github_token_here"
```

### Step 2: Populate Git Credentials

```bash
# Get secret ARN from stack outputs
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerSecrets \
  --query 'Stacks[0].Outputs[?OutputKey==`GitCredentialsSecretArn`].OutputValue' \
  --output text)

# Populate secret value (JSON format)
aws secretsmanager put-secret-value \
  --secret-id $SECRET_ARN \
  --secret-string '{
    "username": "git",
    "password": "your_git_token_here"
  }'
```

### Step 3: Configure GitHub Project Settings

```bash
# Create or update parameter
aws ssm put-parameter \
  --name /kiro-worker/$DEPLOY_ENV/github-project-config \
  --type String \
  --value '{
    "organization": "your-org",
    "repository": "your-repo",
    "projectNumber": 1,
    "targetStatusColumn": "For Implementation"
  }' \
  --overwrite
```

### Step 4: Configure SNS Email Subscriptions

```bash
# Get SNS topic ARN from stack outputs
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerMonitoring \
  --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
  --output text)

# Subscribe email address
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint ops-team@example.com

# Confirm subscription via email
```

## Verification

### Step 1: Verify Stack Deployment

```bash
# List all stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `KiroWorker`)].StackName'

# Expected output:
# [
#   "KiroWorkerCore",
#   "KiroWorkerSecrets",
#   "KiroWorkerPoller",
#   "KiroWorkerCodeBuild",
#   "KiroWorkerMonitoring"
# ]
```

### Step 2: Verify S3 Bucket

```bash
# Get bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerCore \
  --query 'Stacks[0].Outputs[?OutputKey==`ArtifactsBucketName`].OutputValue' \
  --output text)

# Verify bucket exists
aws s3 ls s3://$BUCKET_NAME
```

### Step 3: Verify DynamoDB Table

```bash
# Get table name
TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerCore \
  --query 'Stacks[0].Outputs[?OutputKey==`LocksTableName`].OutputValue' \
  --output text)

# Verify table exists
aws dynamodb describe-table --table-name $TABLE_NAME
```

### Step 4: Verify Lambda Function

```bash
# Get function name
FUNCTION_NAME=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerPoller \
  --query 'Stacks[0].Outputs[?OutputKey==`PollerFunctionName`].OutputValue' \
  --output text)

# Verify function exists
aws lambda get-function --function-name $FUNCTION_NAME

# Test invocation (dry run)
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --invocation-type DryRun \
  /dev/null
```

### Step 5: Verify CodeBuild Project

```bash
# Get project name
PROJECT_NAME=$(aws cloudformation describe-stacks \
  --stack-name KiroWorkerCodeBuild \
  --query 'Stacks[0].Outputs[?OutputKey==`ProjectName`].OutputValue' \
  --output text)

# Verify project exists
aws codebuild batch-get-projects --names $PROJECT_NAME
```

### Step 6: Verify Secrets

```bash
# List secrets
aws secretsmanager list-secrets \
  --filters Key=name,Values=kiro-worker-$DEPLOY_ENV

# Verify secret values are populated (returns metadata only)
aws secretsmanager describe-secret \
  --secret-id kiro-worker-$DEPLOY_ENV-github-token
```

### Step 7: Test Lambda Invocation

```bash
# Manually invoke Lambda to test
aws lambda invoke \
  --function-name $FUNCTION_NAME \
  --payload '{}' \
  response.json

# Check response
cat response.json

# Check CloudWatch logs
aws logs tail /aws/lambda/$FUNCTION_NAME --follow
```

### Step 8: Verify EventBridge Rule

```bash
# List rules
aws events list-rules \
  --name-prefix kiro-worker-$DEPLOY_ENV

# Verify rule is enabled
aws events describe-rule \
  --name kiro-worker-$DEPLOY_ENV-poller-schedule
```

## Rollback Procedures

### Rollback All Stacks

To rollback all stacks in reverse order:

```bash
cd infrastructure

# Destroy in reverse order
cdk destroy KiroWorkerMonitoring --context environment=$DEPLOY_ENV --force
cdk destroy KiroWorkerCodeBuild --context environment=$DEPLOY_ENV --force
cdk destroy KiroWorkerPoller --context environment=$DEPLOY_ENV --force
cdk destroy KiroWorkerSecrets --context environment=$DEPLOY_ENV --force
cdk destroy KiroWorkerCore --context environment=$DEPLOY_ENV --force
```

Or destroy all at once:

```bash
cdk destroy --all --context environment=$DEPLOY_ENV --force
```

### Rollback Individual Stack

```bash
# Destroy specific stack
cdk destroy <stack-name> --context environment=$DEPLOY_ENV --force
```

**Warning**: Destroying stacks will delete resources. Ensure you have backups if needed.

### Rollback to Previous Version

If you need to rollback to a previous version:

```bash
# Checkout previous version
git checkout <previous-commit-or-tag>

# Redeploy
cd infrastructure
cdk deploy --all --context environment=$DEPLOY_ENV
```

### Manual CloudFormation Rollback

If CDK rollback fails, use CloudFormation console or CLI:

```bash
# Rollback stack to previous state
aws cloudformation rollback-stack --stack-name <stack-name>

# Or delete stack entirely
aws cloudformation delete-stack --stack-name <stack-name>
```

## Troubleshooting

See [troubleshooting.md](troubleshooting.md) for detailed troubleshooting guidance.

### Common Issues

**Issue**: CDK bootstrap fails
- **Solution**: Ensure AWS credentials have required permissions. See [iam-permissions.md](iam-permissions.md)

**Issue**: Stack deployment fails with permission error
- **Solution**: Verify IAM permissions for deployment. Run permission validation script.

**Issue**: Lambda function fails to invoke
- **Solution**: Check CloudWatch logs for errors. Verify secrets are populated.

**Issue**: CodeBuild project fails to start
- **Solution**: Verify IAM role has required permissions. Check buildspec.yml syntax.

**Issue**: No work items processed
- **Solution**: Verify GitHub Project configuration. Check Lambda logs for API errors.

## Next Steps

After successful deployment:

1. Create feature branches with spec files
2. Create pull requests for feature branches
3. Add work items to GitHub Project in target status column
4. Monitor builds in AWS Console
5. Review CloudWatch alarms and metrics
6. Configure additional SNS subscriptions as needed

## Support

For additional help:
- Review [troubleshooting.md](troubleshooting.md)
- Check CloudWatch logs for errors
- Review stack outputs for resource details
- Create GitHub issue for bugs or questions

## Deployment Checklist

Use this checklist to track deployment progress:

- [ ] Prerequisites verified
- [ ] Repository cloned and dependencies installed
- [ ] Environment configured
- [ ] CDK bootstrapped (first time only)
- [ ] Dry run completed successfully
- [ ] All stacks deployed
- [ ] Stack outputs saved
- [ ] GitHub token populated
- [ ] Git credentials populated
- [ ] GitHub Project config created
- [ ] SNS email subscriptions configured
- [ ] All verification steps passed
- [ ] Test Lambda invocation successful
- [ ] Test CodeBuild trigger successful
- [ ] Monitoring alarms configured
- [ ] Documentation reviewed

## Maintenance

### Updating Infrastructure

To update infrastructure after code changes:

```bash
cd infrastructure
git pull
npm install
cdk diff --context environment=$DEPLOY_ENV  # Review changes
cdk deploy --all --context environment=$DEPLOY_ENV
```

### Updating Application Code

Application code is deployed via CodeBuild when triggered. To update:

1. Commit changes to repository
2. Push to main branch
3. CodeBuild will use latest code on next execution

### Updating Secrets

```bash
# Update GitHub token
aws secretsmanager update-secret \
  --secret-id kiro-worker-$DEPLOY_ENV-github-token \
  --secret-string "new_token_value"

# Update Git credentials
aws secretsmanager update-secret \
  --secret-id kiro-worker-$DEPLOY_ENV-git-credentials \
  --secret-string '{"username":"git","password":"new_token"}'
```

### Monitoring Costs

Monitor AWS costs for the deployment:

```bash
# View cost and usage
aws ce get-cost-and-usage \
  --time-period Start=2026-01-01,End=2026-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://cost-filter.json
```

Where `cost-filter.json`:
```json
{
  "Tags": {
    "Key": "Project",
    "Values": ["KiroWorker"]
  }
}
```
