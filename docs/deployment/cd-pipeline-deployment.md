# CD Pipeline Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Kiro CodeBuild Worker CD Pipeline infrastructure. The CD Pipeline automates deployment of application changes from the main branch through test, staging, and production environments with comprehensive testing, security scanning, and automated rollback capabilities.

**Important**: This guide covers deploying the **pipeline infrastructure** itself (Stage 1 deployment). Once deployed, the pipeline will automatically handle application deployments (Stage 2) when code is pushed to the main branch.

## Prerequisites

### Required Tools and Access

1. **AWS CLI** (version 2.x or later)
   ```bash
   aws --version
   # Should output: aws-cli/2.x.x or later
   ```

2. **AWS CDK CLI** (version 2.x or later)
   ```bash
   npm install -g aws-cdk
   cdk --version
   # Should output: 2.x.x or later
   ```

3. **Node.js** (version 18.x or later)
   ```bash
   node --version
   # Should output: v18.x.x or later
   ```

4. **Git**
   ```bash
   git --version
   ```

### AWS Account Requirements

1. **AWS Account Access**
   - AWS account with appropriate permissions
   - IAM user or role with administrator access (or specific CDK deployment permissions)
   - AWS credentials configured locally:
     ```bash
     aws configure
     # Or use AWS SSO:
     aws sso login --profile your-profile
     ```

2. **Required IAM Permissions**
   - CloudFormation: Full access (create/update/delete stacks)
   - CodePipeline: Full access
   - CodeBuild: Full access
   - S3: Create buckets, manage objects
   - DynamoDB: Create tables
   - Lambda: Create functions
   - IAM: Create roles and policies
   - CloudWatch: Create alarms, log groups, dashboards
   - EventBridge: Create rules
   - SNS: Create topics and subscriptions
   - Secrets Manager: Create and manage secrets
   - Systems Manager Parameter Store: Create parameters
   - KMS: Create and manage keys

3. **CDK Bootstrap**
   - Your AWS account must be bootstrapped for CDK deployments:
     ```bash
     cdk bootstrap aws://ACCOUNT-ID/REGION
     ```

### GitHub Requirements

1. **GitHub Personal Access Token**
   - Create a GitHub Personal Access Token with the following scopes:
     - `repo` (full control of private repositories)
     - `admin:repo_hook` (write:repo_hook and read:repo_hook)
   - Generate at: https://github.com/settings/tokens
   - **Save this token securely** - you'll need it during deployment

2. **Repository Access**
   - Access to the Kiro CodeBuild Worker repository
   - Permissions to configure webhooks (admin or write access)

### Email for Notifications

- Valid email address(es) for receiving deployment notifications
- Email addresses for approval requests
- Email addresses for rollback alerts

## Configuration Requirements

### Environment Variables

Before deployment, set the following environment variables:

```bash
# Required: Target environment (test, staging, or production)
export ENVIRONMENT=test

# Required: AWS region
export AWS_REGION=us-east-1

# Required: AWS account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Optional: Custom stack name prefix (default: kiro-pipeline)
export STACK_PREFIX=kiro-pipeline
```

### CDK Context Parameters

The CDK app uses context parameters for environment-specific configuration. These are defined in `infrastructure/lib/config/environments.ts` and can be overridden via CDK context:

```bash
# Deploy with specific environment context
cdk deploy --all --context environment=test

# Override specific parameters
cdk deploy --all \
  --context environment=staging \
  --context githubOwner=your-org \
  --context githubRepo=kiro-codebuild-worker
```

## Deployment Steps

### Step 1: Clone Repository and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-org/kiro-codebuild-worker.git
cd kiro-codebuild-worker

# Install application dependencies
npm install

# Install infrastructure dependencies
cd infrastructure
npm install
cd ..
```

### Step 2: Verify CDK Bootstrap

Ensure your AWS account is bootstrapped for CDK:

```bash
# Check if bootstrap stack exists
aws cloudformation describe-stacks \
  --stack-name CDKToolkit \
  --region $AWS_REGION

# If not bootstrapped, run:
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
```

### Step 3: Set Up Secrets

Before deploying the pipeline, create placeholder secrets in AWS Secrets Manager:

```bash
# Run the secrets setup script
cd infrastructure
chmod +x scripts/setup-secrets.sh
./scripts/setup-secrets.sh

# The script will create:
# - kiro-pipeline-{env}-github-token (GitHub OAuth token)
# - kiro-pipeline-{env}-slack-webhook (optional, for Slack notifications)
```

**Important**: After running the script, you must populate the secrets with actual values:

```bash
# Update GitHub token secret
aws secretsmanager put-secret-value \
  --secret-id kiro-pipeline-$ENVIRONMENT-github-token \
  --secret-string "ghp_your_github_token_here" \
  --region $AWS_REGION

# Optional: Update Slack webhook secret
aws secretsmanager put-secret-value \
  --secret-id kiro-pipeline-$ENVIRONMENT-slack-webhook \
  --secret-string "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  --region $AWS_REGION
```

### Step 4: Set Up Parameters

Create configuration parameters in AWS Systems Manager Parameter Store:

```bash
# Run the parameters setup script
chmod +x scripts/setup-parameters.sh
./scripts/setup-parameters.sh

# The script will create parameters for:
# - GitHub owner and repository
# - Alarm thresholds
# - Timeout configurations
```

Verify parameters were created:

```bash
aws ssm get-parameters-by-path \
  --path /kiro-pipeline/$ENVIRONMENT/ \
  --region $AWS_REGION
```

### Step 5: Review CDK Configuration

Before deploying, review the CDK configuration:

```bash
# Synthesize CloudFormation templates
cd infrastructure
cdk synth --all --context environment=$ENVIRONMENT

# Review the generated templates in cdk.out/
ls -la cdk.out/

# Review the CDK diff to see what will be created
cdk diff --all --context environment=$ENVIRONMENT
```

### Step 6: Deploy Pipeline Infrastructure

Deploy the CD pipeline infrastructure stacks in the correct order:

```bash
# Option 1: Use the deployment script (recommended)
chmod +x deploy-pipeline.sh
./deploy-pipeline.sh

# Option 2: Deploy manually
# Deploy Core Infrastructure Stack first
cdk deploy kiro-pipeline-$ENVIRONMENT-core \
  --context environment=$ENVIRONMENT \
  --require-approval never

# Deploy Pipeline Stack
cdk deploy kiro-pipeline-$ENVIRONMENT \
  --context environment=$ENVIRONMENT \
  --require-approval never

# Deploy Monitoring Stack (extended with CD pipeline monitoring)
cdk deploy kiro-worker-$ENVIRONMENT-monitoring \
  --context environment=$ENVIRONMENT \
  --require-approval never
```

**Deployment Progress**: The deployment will take approximately 10-15 minutes. You'll see progress for each stack:
- Creating S3 buckets
- Creating DynamoDB tables
- Creating CodePipeline and CodeBuild projects
- Creating Lambda functions
- Creating CloudWatch alarms and dashboards
- Creating SNS topics

### Step 7: Post-Deployment Validation

After deployment completes, validate that all resources were created successfully:

```bash
# Run the validation script
chmod +x validate-deployment.sh
./validate-deployment.sh

# The script will check:
# - Pipeline exists and is accessible
# - All 5 CodeBuild projects exist
# - S3 artifacts bucket exists with encryption
# - DynamoDB deployments table exists with GSI and TTL
# - Rollback Lambda function exists
# - SNS topics exist
# - CloudWatch alarms are configured
```

Expected output:
```
✓ Pipeline exists: kiro-pipeline-test
✓ CodeBuild projects: 5/5 found
✓ S3 bucket: kiro-pipeline-test-artifacts (encrypted)
✓ DynamoDB table: kiro-pipeline-test-deployments (GSI: EnvironmentStatusIndex, TTL: expiresAt)
✓ Lambda function: kiro-pipeline-test-rollback
✓ SNS topics: 3/3 found
✓ CloudWatch alarms: 3/3 configured

All validation checks passed!
```

### Step 8: Configure SNS Subscriptions

Subscribe email addresses to SNS topics for notifications:

```bash
# Subscribe to deployment notifications
aws sns subscribe \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region $AWS_REGION

# Subscribe to approval requests
aws sns subscribe \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-approvals \
  --protocol email \
  --notification-endpoint approver-email@example.com \
  --region $AWS_REGION

# Subscribe to rollback alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-rollbacks \
  --protocol email \
  --notification-endpoint oncall-email@example.com \
  --region $AWS_REGION
```

**Important**: Each subscriber must confirm their subscription by clicking the link in the confirmation email sent by AWS.

### Step 9: Verify GitHub Webhook

The pipeline should automatically create a webhook in your GitHub repository. Verify it was created:

1. Go to your GitHub repository
2. Navigate to Settings → Webhooks
3. Look for a webhook with URL: `https://webhooks.amazonaws.com/trigger?...`
4. Verify the webhook is active and has recent deliveries

If the webhook wasn't created automatically:
```bash
# Get the webhook URL from CodePipeline
aws codepipeline get-pipeline \
  --name kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION \
  --query 'pipeline.stages[0].actions[0].configuration.WebhookUrl' \
  --output text

# Manually create the webhook in GitHub with this URL
```

### Step 10: Test the Pipeline

Trigger a test pipeline execution:

```bash
# Option 1: Push a commit to main branch
git checkout main
git commit --allow-empty -m "test: trigger pipeline"
git push origin main

# Option 2: Manually start the pipeline
aws codepipeline start-pipeline-execution \
  --name kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION
```

Monitor the pipeline execution:
```bash
# Get pipeline execution status
aws codepipeline get-pipeline-state \
  --name kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION

# Or view in AWS Console:
# https://console.aws.amazon.com/codesuite/codepipeline/pipelines/kiro-pipeline-{env}/view
```

## Multi-Environment Deployment

To deploy the pipeline to multiple environments, repeat the deployment steps for each environment:

### Deploy to Test Environment

```bash
export ENVIRONMENT=test
cd infrastructure
./deploy-pipeline.sh
./validate-deployment.sh
```

### Deploy to Staging Environment

```bash
export ENVIRONMENT=staging
cd infrastructure
./deploy-pipeline.sh
./validate-deployment.sh
```

### Deploy to Production Environment

```bash
export ENVIRONMENT=production
cd infrastructure
./deploy-pipeline.sh
./validate-deployment.sh
```

**Best Practice**: Always deploy and validate in test environment first, then staging, then production.

## Troubleshooting

### Common Errors and Solutions

#### Error: "Stack already exists"

**Problem**: Attempting to deploy a stack that already exists.

**Solution**:
```bash
# Check existing stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --region $AWS_REGION

# Update existing stack instead
cdk deploy --all --context environment=$ENVIRONMENT
```

#### Error: "GitHub token secret not found"

**Problem**: The GitHub token secret hasn't been created or populated.

**Solution**:
```bash
# Create the secret
aws secretsmanager create-secret \
  --name kiro-pipeline-$ENVIRONMENT-github-token \
  --secret-string "ghp_your_token_here" \
  --region $AWS_REGION

# Or update existing secret
aws secretsmanager put-secret-value \
  --secret-id kiro-pipeline-$ENVIRONMENT-github-token \
  --secret-string "ghp_your_token_here" \
  --region $AWS_REGION
```

#### Error: "Insufficient permissions"

**Problem**: IAM user/role lacks required permissions.

**Solution**:
```bash
# Check current IAM identity
aws sts get-caller-identity

# Verify permissions using IAM Policy Simulator
# Or attach AdministratorAccess policy (for initial deployment)
```

#### Error: "CDK bootstrap required"

**Problem**: AWS account not bootstrapped for CDK.

**Solution**:
```bash
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
```

#### Error: "Resource limit exceeded"

**Problem**: AWS service limits reached (e.g., too many S3 buckets, Lambda functions).

**Solution**:
```bash
# Check service quotas
aws service-quotas list-service-quotas \
  --service-code s3 \
  --region $AWS_REGION

# Request quota increase if needed
aws service-quotas request-service-quota-increase \
  --service-code s3 \
  --quota-code L-DC2B2D3D \
  --desired-value 200
```

#### Error: "Pipeline execution failed"

**Problem**: Pipeline execution failed during a stage.

**Solution**:
```bash
# Get detailed execution information
aws codepipeline get-pipeline-execution \
  --pipeline-name kiro-pipeline-$ENVIRONMENT \
  --pipeline-execution-id <execution-id> \
  --region $AWS_REGION

# Check CodeBuild logs
aws codebuild batch-get-builds \
  --ids <build-id> \
  --region $AWS_REGION

# View logs in CloudWatch
aws logs tail /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
  --follow \
  --region $AWS_REGION
```

#### Error: "Webhook not created"

**Problem**: GitHub webhook wasn't automatically created.

**Solution**:
1. Verify GitHub token has correct permissions (`repo`, `admin:repo_hook`)
2. Manually create webhook in GitHub repository settings
3. Use webhook URL from CodePipeline source action configuration

#### Error: "SNS subscription not confirmed"

**Problem**: Email subscribers haven't confirmed their subscriptions.

**Solution**:
1. Check email inbox (including spam folder) for confirmation email
2. Click confirmation link in email
3. Verify subscription status:
   ```bash
   aws sns list-subscriptions-by-topic \
     --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
     --region $AWS_REGION
   ```

### Validation Failures

If `validate-deployment.sh` reports failures:

1. **Pipeline not found**:
   ```bash
   # Check if pipeline stack deployed successfully
   aws cloudformation describe-stacks \
     --stack-name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

2. **CodeBuild projects missing**:
   ```bash
   # List all CodeBuild projects
   aws codebuild list-projects --region $AWS_REGION
   
   # Check if projects were created
   aws codebuild batch-get-projects \
     --names kiro-pipeline-$ENVIRONMENT-build \
     --region $AWS_REGION
   ```

3. **S3 bucket not encrypted**:
   ```bash
   # Check bucket encryption
   aws s3api get-bucket-encryption \
     --bucket kiro-pipeline-$ENVIRONMENT-artifacts \
     --region $AWS_REGION
   ```

4. **DynamoDB table issues**:
   ```bash
   # Describe table
   aws dynamodb describe-table \
     --table-name kiro-pipeline-$ENVIRONMENT-deployments \
     --region $AWS_REGION
   ```

### Getting Help

If you encounter issues not covered here:

1. Check CloudFormation stack events for detailed error messages:
   ```bash
   aws cloudformation describe-stack-events \
     --stack-name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION \
     --max-items 20
   ```

2. Review CDK deployment logs in your terminal

3. Check AWS CloudWatch Logs for Lambda and CodeBuild execution logs

4. Consult the [CD Pipeline Monitoring Guide](../operations/cd-pipeline-monitoring.md)

5. Create a GitHub issue with:
   - Environment (test/staging/production)
   - Error message
   - Stack events
   - Relevant logs

## Next Steps

After successful deployment:

1. **Review Monitoring**: Check the CloudWatch dashboard for pipeline metrics
   - Navigate to CloudWatch → Dashboards → `kiro-pipeline-{env}`
   - Verify widgets display correctly

2. **Test Rollback**: Verify automated rollback works
   - See [CD Pipeline Rollback Guide](cd-pipeline-rollback.md)

3. **Configure Alarms**: Adjust alarm thresholds if needed
   - See [CD Pipeline Monitoring Guide](../operations/cd-pipeline-monitoring.md)

4. **Set Up Operations**: Review operational procedures
   - See [CD Pipeline Runbook](../operations/cd-pipeline-runbook.md)

5. **Train Team**: Ensure team members understand:
   - How to trigger deployments (push to main)
   - How to approve production deployments
   - How to respond to rollback alerts
   - How to monitor pipeline health

## Security Considerations

### Secrets Management

- **Never commit secrets to Git**: All secrets stored in AWS Secrets Manager
- **Rotate secrets regularly**: Update GitHub tokens and other credentials periodically
- **Use least privilege**: Grant minimum required permissions to IAM roles
- **Enable MFA**: Require MFA for production deployments

### Access Control

- **Restrict pipeline access**: Use IAM policies to control who can trigger/approve deployments
- **Audit access**: Enable CloudTrail logging for all pipeline actions
- **Review permissions**: Regularly audit IAM roles and policies

### Encryption

- **All data encrypted**: S3 buckets, DynamoDB tables, CloudWatch logs use KMS encryption
- **Key rotation**: KMS keys have automatic rotation enabled
- **Secure transmission**: All data in transit uses TLS

## Cost Considerations

Estimated monthly costs for CD pipeline infrastructure (per environment):

- **CodePipeline**: ~$1/month (1 active pipeline)
- **CodeBuild**: ~$5-20/month (depends on build frequency and duration)
- **S3**: ~$1-5/month (artifact storage)
- **DynamoDB**: ~$1-2/month (on-demand pricing)
- **Lambda**: ~$0.20/month (rollback function, infrequent invocations)
- **CloudWatch**: ~$5-10/month (logs, metrics, alarms, dashboard)
- **SNS**: ~$0.50/month (notifications)
- **KMS**: ~$1/month (key usage)

**Total estimated cost**: ~$15-40/month per environment

**Cost optimization tips**:
- Use S3 lifecycle policies to delete old artifacts
- Set DynamoDB TTL to automatically delete old deployment records
- Adjust CloudWatch log retention periods
- Use CodeBuild caching to reduce build times

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**:
   - Review pipeline execution metrics
   - Check for failed deployments
   - Verify alarm states

2. **Monthly**:
   - Review and clean up old S3 artifacts
   - Review DynamoDB deployment history
   - Update dependencies (npm packages)
   - Review and adjust alarm thresholds

3. **Quarterly**:
   - Rotate GitHub tokens
   - Review IAM permissions
   - Update CDK and AWS CLI versions
   - Review and update documentation

### Updating Pipeline Infrastructure

When pipeline infrastructure needs updates:

```bash
# Pull latest code
git pull origin main

# Review changes
cd infrastructure
cdk diff --all --context environment=$ENVIRONMENT

# Deploy updates
./deploy-pipeline.sh

# Validate updates
./validate-deployment.sh
```

## Appendix

### Useful Commands

```bash
# List all pipeline stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `kiro-pipeline`)].StackName' \
  --region $AWS_REGION

# Get pipeline execution history
aws codepipeline list-pipeline-executions \
  --pipeline-name kiro-pipeline-$ENVIRONMENT \
  --max-results 10 \
  --region $AWS_REGION

# Get deployment records from DynamoDB
aws dynamodb query \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'$ENVIRONMENT'"}}' \
  --region $AWS_REGION

# View CloudWatch dashboard
aws cloudwatch get-dashboard \
  --dashboard-name kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION

# Check alarm states
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION
```

### Environment-Specific Configuration

Configuration differences between environments:

| Setting | Test | Staging | Production |
|---------|------|---------|------------|
| Health Check Duration | 5 minutes | 5 minutes | 10 minutes |
| Manual Approval | No | No | Yes (24h timeout) |
| Alarm Thresholds | Relaxed | Standard | Strict |
| Rollback | Automatic | Automatic | Automatic |
| Notifications | Dev team | Dev + QA | All stakeholders |

### Related Documentation

- [CD Pipeline Rollback Guide](cd-pipeline-rollback.md)
- [CD Pipeline Monitoring Guide](../operations/cd-pipeline-monitoring.md)
- [CD Pipeline Runbook](../operations/cd-pipeline-runbook.md)
- [Architecture Documentation](../architecture/cd-pipeline-architecture.md)
- [TypeScript Standards](../../.kiro/steering/typescript-standards.md)
- [AWS CDK Standards](../../.kiro/steering/aws-cdk-standards.md)
- [Deployment Strategy](../../.kiro/steering/deployment-strategy.md)
