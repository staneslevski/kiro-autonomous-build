# CD Pipeline Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Architecture](#deployment-architecture)
4. [Pre-Deployment Setup](#pre-deployment-setup)
5. [Deployment Steps](#deployment-steps)
6. [Configuration](#configuration)
7. [Post-Deployment Validation](#post-deployment-validation)
8. [Troubleshooting](#troubleshooting)
9. [Updating the Pipeline](#updating-the-pipeline)
10. [Rollback Procedures](#rollback-procedures)

## Overview

This guide provides comprehensive instructions for deploying the Kiro CodeBuild Worker CD (Continuous Deployment) Pipeline infrastructure. The CD pipeline automates the deployment of application changes from the main branch through multiple environments (test → staging → production) with comprehensive testing, security scanning, monitoring, and automated rollback capabilities.

### Two-Stage Deployment Model

The CD pipeline implements a **two-stage deployment architecture**:

**Stage 1: Pipeline Infrastructure Deployment** (Manual, from Developer Laptop)
- Deployed using AWS CDK from the `infrastructure/` directory
- Creates the CI/CD pipeline infrastructure itself (CodePipeline, CodeBuild, monitoring, rollback systems)
- Deployed manually by DevOps engineers using `cdk deploy` commands
- One-time setup per environment (or when pipeline infrastructure changes)
- Infrequent updates (typically when pipeline features change)

**Stage 2: Application Deployment** (Automatic, via Pipeline)
- Deployed automatically by the CodePipeline created in Stage 1
- Triggered by commits to main branch via GitHub webhook
- Deploys the Kiro CodeBuild Worker application code
- Runs continuously for every code change
- Frequent updates (multiple times per day)

**This guide focuses on Stage 1: Pipeline Infrastructure Deployment.**

## Prerequisites

### Required Software

Before deploying the CD pipeline infrastructure, ensure you have the following installed on your local machine:

1. **Node.js 18+**
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **npm** (comes with Node.js)
   ```bash
   npm --version
   ```

3. **AWS CLI v2**
   ```bash
   aws --version  # Should be aws-cli/2.x.x or higher
   ```

4. **AWS CDK CLI v2**
   ```bash
   npm install -g aws-cdk
   cdk --version  # Should be 2.x.x or higher
   ```

5. **Git**
   ```bash
   git --version
   ```

### AWS Account Requirements

1. **AWS Account Access**
   - Active AWS account with appropriate permissions
   - Account ID noted for configuration

2. **IAM Permissions**
   
   Your IAM user or role must have permissions to:
   - Create and manage CloudFormation stacks
   - Create and manage CodePipeline resources
   - Create and manage CodeBuild projects
   - Create and manage S3 buckets
   - Create and manage DynamoDB tables
   - Create and manage Lambda functions
   - Create and manage CloudWatch resources (alarms, dashboards, log groups)
   - Create and manage SNS topics
   - Create and manage EventBridge rules
   - Create and manage IAM roles and policies
   - Create and manage KMS keys
   - Create and manage Secrets Manager secrets
   - Create and manage Systems Manager parameters

   **Recommended**: Use the `AdministratorAccess` managed policy for initial deployment, then restrict to least privilege for ongoing operations.

3. **AWS CLI Configuration**
   ```bash
   # Configure AWS CLI with your credentials
   aws configure
   
   # Verify configuration
   aws sts get-caller-identity
   ```
   
   Expected output:
   ```json
   {
     "UserId": "AIDAXXXXXXXXXXXXXXXXX",
     "Account": "123456789012",
     "Arn": "arn:aws:iam::123456789012:user/your-username"
   }
   ```

### GitHub Requirements

1. **GitHub Repository Access**
   - Access to the Kiro CodeBuild Worker repository
   - Main branch protection enabled (requires PR approval)

2. **GitHub Personal Access Token**
   - Create a GitHub Personal Access Token with the following scopes:
     - `repo` (Full control of private repositories)
     - `admin:repo_hook` (Full control of repository hooks)
   
   **To create a token:**
   1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   2. Click "Generate new token (classic)"
   3. Select the required scopes
   4. Generate and save the token securely (you won't be able to see it again)

3. **Repository Configuration**
   - Note your GitHub organization/owner name
   - Note your repository name

### Environment Selection

Choose which environment you're deploying to:
- **test**: Development and testing environment
- **staging**: Pre-production validation environment
- **production**: Live production environment

**Recommendation**: Always deploy to `test` first, validate thoroughly, then proceed to `staging` and `production`.

## Deployment Architecture

### Infrastructure Components

The CD pipeline infrastructure consists of three main CDK stacks:

1. **CD Pipeline Core Infrastructure Stack** (`KiroPipelineCore`)
   - S3 artifacts bucket with encryption and lifecycle policies
   - DynamoDB deployments table with TTL and GSI
   - KMS encryption keys with rotation enabled
   - CloudWatch log groups for pipeline and rollback

2. **CD Pipeline Stack** (`KiroPipeline`)
   - AWS CodePipeline with 5 stages (Source, Build, TestEnv, StagingEnv, ProductionEnv)
   - CodeBuild projects for build, integration tests, E2E tests, and deployment
   - IAM roles and policies with least privilege
   - GitHub webhook integration

3. **Monitoring and Alerting Stack** (`KiroPipelineMonitoring`)
   - CloudWatch alarms for pipeline failures, rollbacks, and duration
   - SNS topics for deployment, approval, and rollback notifications
   - Rollback Lambda function with EventBridge trigger
   - CloudWatch dashboard for pipeline metrics

### Stack Dependencies

The stacks must be deployed in order due to dependencies:

```
KiroPipelineCore
       ↓
KiroPipeline (depends on Core outputs)
       ↓
KiroPipelineMonitoring (depends on Pipeline outputs)
```

## Pre-Deployment Setup

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
```

### Step 2: Bootstrap CDK (First Time Only)

If this is your first time using CDK in this AWS account/region, you need to bootstrap:

```bash
# Bootstrap CDK in your account/region
cdk bootstrap aws://ACCOUNT-ID/REGION

# Example:
cdk bootstrap aws://123456789012/us-east-1
```

**Note**: Replace `ACCOUNT-ID` with your AWS account ID and `REGION` with your target region (e.g., `us-east-1`).

### Step 3: Verify Environment Configuration

Check that the environment configuration is correct:

```bash
# View environment configuration
cat infrastructure/lib/config/environments.ts
```

Ensure the configuration for your target environment includes:
- `account`: Your AWS account ID
- `region`: Your target region
- `environment`: 'test', 'staging', or 'production'
- `githubOwner`: Your GitHub organization/owner
- `githubRepo`: Your repository name
- `pipelineEnabled`: true
- `healthCheckDuration`: Duration for health checks

### Step 4: Build Infrastructure Code

```bash
# From the infrastructure directory
npm run build

# Verify TypeScript compilation succeeds
echo $?  # Should output 0
```

### Step 5: Run Infrastructure Tests

```bash
# Run all infrastructure tests
npm test

# Run with coverage
npm run test:coverage

# Verify all tests pass and coverage ≥ 80%
```

## Deployment Steps

### Overview

The deployment process consists of:
1. Synthesize CDK stacks
2. Review changes
3. Deploy stacks sequentially
4. Configure secrets and parameters
5. Validate deployment

### Step 1: Synthesize CDK Stacks

Synthesize the CloudFormation templates to review what will be created:

```bash
# From the infrastructure directory
cdk synth --all --context environment=test

# This creates CloudFormation templates in cdk.out/
ls cdk.out/
```

Expected output:
```
KiroPipelineCoreTest.template.json
KiroPipelineTest.template.json
KiroPipelineMonitoringTest.template.json
manifest.json
tree.json
```

### Step 2: Review Changes with CDK Diff

Before deploying, review what changes will be made:

```bash
# Review changes for all stacks
cdk diff --all --context environment=test
```

This shows:
- Resources to be created (green +)
- Resources to be modified (yellow ~)
- Resources to be deleted (red -)
- IAM policy changes
- Security group changes

**Important**: Review IAM permissions carefully to ensure least privilege.

### Step 3: Deploy Core Infrastructure Stack

Deploy the core infrastructure stack first:

```bash
# Deploy core infrastructure
cdk deploy KiroPipelineCoreTest --context environment=test

# Or use the deployment script
./deploy-pipeline.sh test core
```

**What gets created:**
- S3 bucket: `kiro-pipeline-test-artifacts`
- DynamoDB table: `kiro-pipeline-test-deployments`
- KMS key: `kiro-pipeline-test-key`
- CloudWatch log groups:
  - `/aws/codepipeline/kiro-pipeline-test`
  - `/aws/lambda/kiro-pipeline-test-rollback`

**Expected duration**: 3-5 minutes

**Confirmation prompt**: CDK will show a summary and ask for confirmation. Review and type `y` to proceed.

**Stack outputs**: Note the outputs displayed after deployment:
```
Outputs:
KiroPipelineCoreTest.ArtifactsBucketName = kiro-pipeline-test-artifacts
KiroPipelineCoreTest.ArtifactsBucketArn = arn:aws:s3:::kiro-pipeline-test-artifacts
KiroPipelineCoreTest.DeploymentsTableName = kiro-pipeline-test-deployments
KiroPipelineCoreTest.DeploymentsTableArn = arn:aws:dynamodb:us-east-1:123456789012:table/kiro-pipeline-test-deployments
KiroPipelineCoreTest.KmsKeyArn = arn:aws:kms:us-east-1:123456789012:key/...
```

### Step 4: Deploy Pipeline Stack

Deploy the pipeline stack:

```bash
# Deploy pipeline
cdk deploy KiroPipelineTest --context environment=test

# Or use the deployment script
./deploy-pipeline.sh test pipeline
```

**What gets created:**
- CodePipeline: `kiro-pipeline-test`
- CodeBuild projects:
  - `kiro-pipeline-test-build`
  - `kiro-pipeline-test-integration-test`
  - `kiro-pipeline-test-e2e-test`
  - `kiro-pipeline-test-deploy-test`
  - `kiro-pipeline-test-deploy-staging`
  - `kiro-pipeline-test-deploy-production`
- IAM roles for pipeline and CodeBuild
- GitHub webhook integration

**Expected duration**: 5-7 minutes

**Note**: The pipeline will be created but won't be functional until secrets are configured (next section).

### Step 5: Deploy Monitoring Stack

Deploy the monitoring and alerting stack:

```bash
# Deploy monitoring
cdk deploy KiroPipelineMonitoringTest --context environment=test

# Or use the deployment script
./deploy-pipeline.sh test monitoring
```

**What gets created:**
- CloudWatch alarms:
  - `kiro-pipeline-test-failures` (pipeline failure rate)
  - `kiro-pipeline-test-rollbacks` (rollback count)
  - `kiro-pipeline-test-duration` (deployment duration)
- SNS topics:
  - `kiro-pipeline-test-deployments` (deployment notifications)
  - `kiro-pipeline-test-approvals` (approval requests)
  - `kiro-pipeline-test-rollbacks` (rollback notifications)
- Lambda function: `kiro-pipeline-test-rollback`
- EventBridge rule for alarm state changes
- CloudWatch dashboard: `kiro-pipeline-test-dashboard`

**Expected duration**: 3-5 minutes

### Step 6: Deploy All Stacks at Once (Alternative)

Alternatively, deploy all stacks in one command:

```bash
# Deploy all stacks sequentially
cdk deploy --all --context environment=test

# Or use the deployment script
./deploy-pipeline.sh test
```

**Expected total duration**: 10-15 minutes

**Note**: CDK will prompt for confirmation for each stack. Review and approve each one.

## Configuration

After deploying the infrastructure, you need to configure secrets and parameters.

### Step 1: Create GitHub Token Secret

Store your GitHub Personal Access Token in AWS Secrets Manager:

```bash
# Create secret
aws secretsmanager create-secret \
  --name kiro-pipeline-test-github-token \
  --description "GitHub OAuth token for Kiro Pipeline test environment" \
  --secret-string "ghp_YOUR_GITHUB_TOKEN_HERE" \
  --region us-east-1

# Or use the setup script
cd infrastructure/scripts
./setup-secrets.sh test
```

**Important**: Replace `ghp_YOUR_GITHUB_TOKEN_HERE` with your actual GitHub Personal Access Token.

**Verify secret creation:**
```bash
aws secretsmanager describe-secret \
  --secret-id kiro-pipeline-test-github-token \
  --region us-east-1
```

### Step 2: Create Slack Webhook Secret (Optional)

If you want Slack notifications, create a webhook secret:

```bash
# Create Slack webhook secret
aws secretsmanager create-secret \
  --name kiro-pipeline-test-slack-webhook \
  --description "Slack webhook URL for Kiro Pipeline notifications" \
  --secret-string "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  --region us-east-1
```

### Step 3: Configure Systems Manager Parameters

Set up configuration parameters:

```bash
# GitHub owner/organization
aws ssm put-parameter \
  --name /kiro-pipeline/test/github-owner \
  --value "your-github-org" \
  --type String \
  --region us-east-1

# GitHub repository name
aws ssm put-parameter \
  --name /kiro-pipeline/test/github-repo \
  --value "kiro-codebuild-worker" \
  --type String \
  --region us-east-1

# Notification email
aws ssm put-parameter \
  --name /kiro-pipeline/test/notification-email \
  --value "devops-team@example.com" \
  --type String \
  --region us-east-1

# Or use the setup script
cd infrastructure/scripts
./setup-parameters.sh test
```

**Verify parameters:**
```bash
aws ssm get-parameters-by-path \
  --path /kiro-pipeline/test \
  --region us-east-1
```

### Step 4: Subscribe to SNS Topics

Subscribe email addresses to SNS topics for notifications:

```bash
# Subscribe to deployment notifications
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-test-deployments \
  --protocol email \
  --notification-endpoint devops-team@example.com \
  --region us-east-1

# Subscribe to approval requests
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-test-approvals \
  --protocol email \
  --notification-endpoint devops-team@example.com \
  --region us-east-1

# Subscribe to rollback notifications
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-test-rollbacks \
  --protocol email \
  --notification-endpoint devops-team@example.com \
  --region us-east-1
```

**Important**: Check your email and confirm each subscription by clicking the confirmation link.

### Step 5: Configure GitHub Webhook (Automatic)

The GitHub webhook is automatically configured by CodePipeline when you deploy the pipeline stack. Verify it was created:

1. Go to your GitHub repository
2. Navigate to Settings → Webhooks
3. You should see a webhook with:
   - Payload URL: `https://webhooks.amazonaws.com/trigger?...`
   - Content type: `application/json`
   - Events: `Just the push event`
   - Active: ✓

If the webhook is not present, you may need to manually trigger the pipeline once to create it.

## Post-Deployment Validation

After deployment, validate that all resources were created correctly.

### Step 1: Run Validation Script

Use the provided validation script:

```bash
# From the infrastructure directory
./validate-deployment.sh test
```

This script checks:
- ✓ Pipeline exists
- ✓ All 5 CodeBuild projects exist
- ✓ S3 artifacts bucket exists with encryption
- ✓ DynamoDB deployments table exists with GSI and TTL
- ✓ Rollback Lambda function exists
- ✓ All 3 SNS topics exist
- ✓ CloudWatch dashboard exists
- ✓ EventBridge rule exists

**Expected output:**
```
Validating CD Pipeline deployment for environment: test
✓ Pipeline kiro-pipeline-test exists
✓ CodeBuild project kiro-pipeline-test-build exists
✓ CodeBuild project kiro-pipeline-test-integration-test exists
✓ CodeBuild project kiro-pipeline-test-e2e-test exists
✓ CodeBuild project kiro-pipeline-test-deploy-test exists
✓ CodeBuild project kiro-pipeline-test-deploy-staging exists
✓ CodeBuild project kiro-pipeline-test-deploy-production exists
✓ S3 bucket kiro-pipeline-test-artifacts exists with encryption
✓ DynamoDB table kiro-pipeline-test-deployments exists with GSI and TTL
✓ Lambda function kiro-pipeline-test-rollback exists
✓ SNS topic kiro-pipeline-test-deployments exists
✓ SNS topic kiro-pipeline-test-approvals exists
✓ SNS topic kiro-pipeline-test-rollbacks exists
✓ CloudWatch dashboard kiro-pipeline-test-dashboard exists
✓ EventBridge rule kiro-pipeline-test-alarm-rollback exists

All validation checks passed!
```

### Step 2: Manual Validation Checks

Perform additional manual checks:

#### Check Pipeline Status

```bash
# Get pipeline details
aws codepipeline get-pipeline --name kiro-pipeline-test

# Get pipeline state
aws codepipeline get-pipeline-state --name kiro-pipeline-test
```

Expected state: Pipeline should be in "Succeeded" or "InProgress" state (if triggered).

#### Check CodeBuild Projects

```bash
# List all CodeBuild projects
aws codebuild list-projects | grep kiro-pipeline-test

# Get details of build project
aws codebuild batch-get-projects \
  --names kiro-pipeline-test-build
```

#### Check S3 Bucket

```bash
# Verify bucket exists
aws s3 ls | grep kiro-pipeline-test-artifacts

# Check bucket encryption
aws s3api get-bucket-encryption \
  --bucket kiro-pipeline-test-artifacts
```

Expected: Encryption should be enabled with KMS.

#### Check DynamoDB Table

```bash
# Describe table
aws dynamodb describe-table \
  --table-name kiro-pipeline-test-deployments

# Verify TTL is enabled
aws dynamodb describe-time-to-live \
  --table-name kiro-pipeline-test-deployments
```

Expected: TTL should be enabled on `expiresAt` attribute.

#### Check Lambda Function

```bash
# Get function details
aws lambda get-function \
  --function-name kiro-pipeline-test-rollback

# Check function configuration
aws lambda get-function-configuration \
  --function-name kiro-pipeline-test-rollback
```

Expected: Function should have environment variables for TABLE_NAME, PIPELINE_ARN, and TOPIC_ARN.

#### Check CloudWatch Dashboard

```bash
# List dashboards
aws cloudwatch list-dashboards | grep kiro-pipeline-test

# Get dashboard details
aws cloudwatch get-dashboard \
  --dashboard-name kiro-pipeline-test-dashboard
```

Or visit the AWS Console:
1. Go to CloudWatch → Dashboards
2. Open `kiro-pipeline-test-dashboard`
3. Verify widgets for pipeline executions, duration, rollbacks, and test results

### Step 3: Trigger First Pipeline Execution

Trigger the pipeline to verify end-to-end functionality:

```bash
# Create an empty commit to trigger the pipeline
git checkout main
git commit --allow-empty -m "chore: trigger initial CD pipeline execution"
git push origin main

# Monitor pipeline execution
aws codepipeline get-pipeline-state --name kiro-pipeline-test

# Or watch in real-time
watch -n 10 'aws codepipeline get-pipeline-state --name kiro-pipeline-test'
```

**Expected behavior:**
1. Source stage completes (pulls code from GitHub)
2. Build stage runs (compile, test, security scan)
3. Test environment stage deploys and runs integration tests
4. Staging environment stage deploys and runs E2E tests
5. Production environment stage waits for manual approval

**Note**: The first execution may take longer as CodeBuild downloads dependencies and builds caches.

### Step 4: Verify Deployment Record

After the pipeline runs, check that deployment records are being created:

```bash
# Query DynamoDB for deployment records
aws dynamodb scan \
  --table-name kiro-pipeline-test-deployments \
  --limit 5

# Or query by environment
aws dynamodb query \
  --table-name kiro-pipeline-test-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"test"}}'
```

Expected: You should see deployment records with status, timestamps, and test results.

### Step 5: Verify Notifications

Check that you received email notifications:
- Deployment started notification
- Stage completion notifications
- Approval request (for production stage)

If you don't receive notifications:
1. Check SNS subscription status (should be "Confirmed")
2. Check spam/junk folder
3. Verify email address is correct in SNS subscription

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: CDK Bootstrap Error

**Error:**
```
❌ CDK bootstrap stack version mismatch
```

**Solution:**
```bash
# Re-bootstrap with the latest version
cdk bootstrap aws://ACCOUNT-ID/REGION --force
```

#### Issue 2: Insufficient IAM Permissions

**Error:**
```
❌ User: arn:aws:iam::123456789012:user/username is not authorized to perform: cloudformation:CreateStack
```

**Solution:**
1. Verify your IAM user/role has necessary permissions
2. Attach the `AdministratorAccess` policy (for initial deployment)
3. Or create a custom policy with required permissions (see Prerequisites section)

```bash
# Check your current permissions
aws iam get-user
aws iam list-attached-user-policies --user-name your-username
```

#### Issue 3: GitHub Token Secret Not Found

**Error:**
```
❌ Secret kiro-pipeline-test-github-token not found
```

**Solution:**
```bash
# Create the secret
aws secretsmanager create-secret \
  --name kiro-pipeline-test-github-token \
  --secret-string "ghp_YOUR_TOKEN_HERE" \
  --region us-east-1

# Verify it was created
aws secretsmanager describe-secret \
  --secret-id kiro-pipeline-test-github-token
```

#### Issue 4: Pipeline Fails on First Run

**Error:**
```
Pipeline execution failed in Build stage
```

**Solution:**
1. Check CodeBuild logs:
   ```bash
   # Get recent build IDs
   aws codebuild list-builds-for-project \
     --project-name kiro-pipeline-test-build \
     --sort-order DESCENDING \
     --max-items 5
   
   # Get build details
   aws codebuild batch-get-builds --ids BUILD_ID
   ```

2. Common causes:
   - Missing dependencies: Check `package.json` and `npm install` logs
   - Test failures: Check test output in CodeBuild logs
   - Coverage below 80%: Add more tests or fix existing ones
   - Security scan failures: Fix vulnerabilities or update dependencies

#### Issue 5: Stack Deployment Fails

**Error:**
```
❌ Stack KiroPipelineTest failed to create
```

**Solution:**
1. Check CloudFormation events:
   ```bash
   aws cloudformation describe-stack-events \
     --stack-name KiroPipelineTest \
     --max-items 20
   ```

2. Look for the first "CREATE_FAILED" event and read the reason
3. Common causes:
   - Resource name conflicts: Delete existing resources or use different names
   - Quota limits: Request quota increase in AWS Service Quotas
   - Invalid configuration: Review CDK code and fix errors

4. Rollback and retry:
   ```bash
   # Delete failed stack
   cdk destroy KiroPipelineTest --context environment=test
   
   # Fix the issue, then redeploy
   cdk deploy KiroPipelineTest --context environment=test
   ```

#### Issue 6: GitHub Webhook Not Created

**Error:**
```
Pipeline not triggering on push to main branch
```

**Solution:**
1. Manually trigger the pipeline once:
   ```bash
   aws codepipeline start-pipeline-execution \
     --name kiro-pipeline-test
   ```

2. Check GitHub webhook:
   - Go to GitHub repository → Settings → Webhooks
   - Verify webhook exists and is active
   - Check recent deliveries for errors

3. If webhook is missing, recreate it:
   - Delete the pipeline source action
   - Redeploy the pipeline stack
   - Or manually create webhook in GitHub pointing to CodePipeline

#### Issue 7: DynamoDB Table Already Exists

**Error:**
```
❌ Table kiro-pipeline-test-deployments already exists
```

**Solution:**
1. If this is a redeploy, the table should be reused (CDK should handle this)
2. If you want a fresh start:
   ```bash
   # Delete the table
   aws dynamodb delete-table \
     --table-name kiro-pipeline-test-deployments
   
   # Wait for deletion to complete
   aws dynamodb wait table-not-exists \
     --table-name kiro-pipeline-test-deployments
   
   # Redeploy
   cdk deploy KiroPipelineCoreTest --context environment=test
   ```

#### Issue 8: Lambda Function Fails to Invoke

**Error:**
```
Rollback Lambda function failed with timeout
```

**Solution:**
1. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/kiro-pipeline-test-rollback --follow
   ```

2. Common causes:
   - Timeout too short: Increase timeout in CDK (currently 15 minutes)
   - Missing permissions: Check IAM role has required permissions
   - DynamoDB table not accessible: Verify table exists and Lambda has read/write permissions

3. Test Lambda manually:
   ```bash
   # Create test event
   cat > test-event.json <<EOF
   {
     "version": "0",
     "id": "test-event",
     "detail-type": "CloudWatch Alarm State Change",
     "source": "aws.cloudwatch",
     "detail": {
       "alarmName": "kiro-pipeline-test-failures",
       "state": {
         "value": "ALARM",
         "reason": "Test alarm"
       }
     }
   }
   EOF
   
   # Invoke Lambda
   aws lambda invoke \
     --function-name kiro-pipeline-test-rollback \
     --payload file://test-event.json \
     --log-type Tail \
     response.json
   
   # Check response
   cat response.json
   ```

### Debugging Tips

#### Enable Verbose CDK Output

```bash
# Deploy with verbose output
cdk deploy --all --context environment=test --verbose
```

#### Check CloudFormation Stack Status

```bash
# List all stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Describe specific stack
aws cloudformation describe-stacks \
  --stack-name KiroPipelineTest

# Get stack events (useful for debugging failures)
aws cloudformation describe-stack-events \
  --stack-name KiroPipelineTest
```

#### Check CodeBuild Logs

```bash
# Get recent builds
aws codebuild list-builds-for-project \
  --project-name kiro-pipeline-test-build

# Get build logs
aws logs tail /aws/codebuild/kiro-pipeline-test-build --follow
```

#### Check Pipeline Execution History

```bash
# List recent executions
aws codepipeline list-pipeline-executions \
  --pipeline-name kiro-pipeline-test \
  --max-results 10

# Get execution details
aws codepipeline get-pipeline-execution \
  --pipeline-name kiro-pipeline-test \
  --pipeline-execution-id EXECUTION_ID
```

#### Verify IAM Permissions

```bash
# Check what permissions your user has
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/your-username \
  --action-names cloudformation:CreateStack codepipeline:CreatePipeline \
  --resource-arns "*"
```

## Updating the Pipeline

### When to Update Pipeline Infrastructure

Update the pipeline infrastructure when:
- Adding new stages or actions to the pipeline
- Modifying CodeBuild project configurations
- Adding new CloudWatch alarms or SNS topics
- Changing IAM permissions
- Updating Lambda function code or configuration
- Modifying DynamoDB table schema

**Note**: Application code changes do NOT require pipeline infrastructure updates. The pipeline automatically deploys application changes.

### Update Process

1. **Make changes to infrastructure code**
   ```bash
   cd infrastructure
   # Edit CDK files in lib/stacks/ or lib/constructs/
   ```

2. **Test changes locally**
   ```bash
   npm run build
   npm test
   npm run test:coverage
   ```

3. **Review changes**
   ```bash
   cdk diff --all --context environment=test
   ```

4. **Deploy updates**
   ```bash
   cdk deploy --all --context environment=test
   ```

5. **Validate updates**
   ```bash
   ./validate-deployment.sh test
   ```

### Rolling Back Pipeline Infrastructure

If an update causes issues, rollback to the previous version:

```bash
# Option 1: Rollback via CloudFormation
aws cloudformation rollback-stack \
  --stack-name KiroPipelineTest

# Option 2: Redeploy previous version
git checkout <previous-commit>
cd infrastructure
cdk deploy --all --context environment=test

# Option 3: Delete and recreate (last resort)
cdk destroy --all --context environment=test
# Fix issues, then redeploy
cdk deploy --all --context environment=test
```

**Important**: Deleting stacks will remove all resources. Ensure you have backups of important data (DynamoDB deployment history, CloudWatch logs).

## Rollback Procedures

### Automated Rollback

The CD pipeline includes automated rollback capabilities that trigger when:
- Test failures occur
- Security scan failures occur
- CloudWatch alarms enter ALARM state
- Deployment failures occur

**No manual intervention required** for automated rollback.

### Manual Rollback

For manual rollback of application deployments, see the separate rollback documentation:
- [CD Pipeline Rollback Guide](./cd-pipeline-rollback.md)

### Pipeline Infrastructure Rollback

See "Rolling Back Pipeline Infrastructure" section above.

## Deploying to Additional Environments

### Deploying to Staging

After successfully deploying and validating in the test environment, deploy to staging:

```bash
# Deploy all stacks to staging
cdk deploy --all --context environment=staging

# Configure secrets
aws secretsmanager create-secret \
  --name kiro-pipeline-staging-github-token \
  --secret-string "ghp_YOUR_TOKEN_HERE" \
  --region us-east-1

# Configure parameters
./infrastructure/scripts/setup-parameters.sh staging

# Validate deployment
./infrastructure/validate-deployment.sh staging
```

### Deploying to Production

After successful staging validation, deploy to production:

```bash
# Deploy all stacks to production
cdk deploy --all --context environment=production

# Configure secrets
aws secretsmanager create-secret \
  --name kiro-pipeline-production-github-token \
  --secret-string "ghp_YOUR_TOKEN_HERE" \
  --region us-east-1

# Configure parameters
./infrastructure/scripts/setup-parameters.sh production

# Validate deployment
./infrastructure/validate-deployment.sh production
```

**Important**: Production deployments should be:
- Scheduled during maintenance windows
- Announced to stakeholders
- Monitored closely after deployment
- Backed by a tested rollback plan

## Environment-Specific Considerations

### Test Environment

- **Purpose**: Development and testing
- **Polling interval**: Every 5 minutes
- **Health check duration**: 5 minutes
- **Approval required**: No (auto-approve for test deployments)
- **Monitoring**: Basic alarms
- **Cost optimization**: Use smaller instance types, shorter retention periods

### Staging Environment

- **Purpose**: Pre-production validation
- **Polling interval**: Every 10 minutes
- **Health check duration**: 5 minutes
- **Approval required**: Optional (can enable for critical changes)
- **Monitoring**: Full production-like monitoring
- **Cost optimization**: Balance between cost and production parity

### Production Environment

- **Purpose**: Live production system
- **Polling interval**: Every 15 minutes
- **Health check duration**: 10 minutes
- **Approval required**: Yes (mandatory manual approval)
- **Monitoring**: Comprehensive monitoring with strict thresholds
- **Cost optimization**: Prioritize reliability over cost

## Security Best Practices

### Secrets Management

1. **Never commit secrets to Git**
   - Use AWS Secrets Manager for all sensitive data
   - Rotate secrets regularly (every 90 days recommended)
   - Use different secrets for each environment

2. **Least Privilege IAM Permissions**
   - Review IAM policies regularly
   - Remove unused permissions
   - Use IAM Access Analyzer to identify overly permissive policies

3. **Encryption**
   - All data at rest is encrypted (S3, DynamoDB, CloudWatch logs)
   - All data in transit uses TLS
   - KMS keys have automatic rotation enabled

### Monitoring and Auditing

1. **Enable CloudTrail**
   ```bash
   # Verify CloudTrail is enabled
   aws cloudtrail describe-trails
   ```

2. **Review CloudWatch Logs**
   - Monitor for suspicious activity
   - Set up log metric filters for security events
   - Retain logs for compliance requirements (90 days minimum)

3. **Regular Security Audits**
   - Run AWS Trusted Advisor checks
   - Use AWS Security Hub for compliance monitoring
   - Review IAM Access Analyzer findings

### Network Security

1. **VPC Configuration** (if using VPC)
   - Use private subnets for CodeBuild
   - Configure security groups with minimal required access
   - Use VPC endpoints for AWS services

2. **GitHub Webhook Security**
   - Webhook uses HTTPS
   - Webhook secret is validated by CodePipeline
   - Only push events trigger the pipeline

## Cost Optimization

### Estimated Monthly Costs

**Test Environment** (approximate):
- CodePipeline: $1/month (1 active pipeline)
- CodeBuild: $10-50/month (depends on build frequency)
- S3: $1-5/month (artifacts storage)
- DynamoDB: $1-2/month (on-demand pricing)
- Lambda: <$1/month (minimal invocations)
- CloudWatch: $5-10/month (logs, metrics, alarms)
- **Total**: ~$20-70/month

**Production Environment** (approximate):
- Similar to test, but with higher usage
- **Total**: ~$50-150/month

### Cost Reduction Tips

1. **S3 Lifecycle Policies**
   - Artifacts automatically deleted after 90 days
   - Transition to Infrequent Access after 30 days

2. **CloudWatch Log Retention**
   - Logs retained for 90 days (configurable)
   - Consider shorter retention for non-production

3. **CodeBuild Optimization**
   - Use caching to speed up builds
   - Use smaller compute types when possible
   - Optimize build scripts to reduce duration

4. **DynamoDB On-Demand Pricing**
   - Pay only for what you use
   - No provisioned capacity costs
   - Automatic scaling

## Support and Resources

### Documentation

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS CodePipeline Documentation](https://docs.aws.amazon.com/codepipeline/)
- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [CD Pipeline Rollback Guide](./cd-pipeline-rollback.md)
- [CD Pipeline Monitoring Guide](../operations/cd-pipeline-monitoring.md)
- [CD Pipeline Runbook](../operations/cd-pipeline-runbook.md)

### Getting Help

1. **Check CloudWatch Logs**
   - Most issues can be diagnosed from logs
   - Look for error messages and stack traces

2. **Review CloudFormation Events**
   - Stack creation/update failures show detailed reasons
   - Check for resource conflicts or quota limits

3. **Consult AWS Support**
   - Use AWS Support Center for account-specific issues
   - Check AWS Service Health Dashboard for service outages

4. **Internal Support**
   - Contact DevOps team: devops-team@example.com
   - Slack channel: #kiro-pipeline-support
   - On-call rotation: See PagerDuty schedule

## Appendix

### Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `ENVIRONMENT` | Target environment | `test`, `staging`, `production` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `AWS_ACCOUNT_ID` | AWS account ID | `123456789012` |
| `COVERAGE_THRESHOLD` | Minimum code coverage | `80` |

### Context Parameters Reference

| Parameter | Description | Example |
|-----------|-------------|---------|
| `environment` | Target environment for CDK deployment | `test` |
| `account` | AWS account ID | `123456789012` |
| `region` | AWS region | `us-east-1` |

### Resource Naming Conventions

All resources follow the pattern: `kiro-pipeline-{environment}-{resource-type}`

Examples:
- Pipeline: `kiro-pipeline-test`
- S3 Bucket: `kiro-pipeline-test-artifacts`
- DynamoDB Table: `kiro-pipeline-test-deployments`
- Lambda Function: `kiro-pipeline-test-rollback`
- SNS Topic: `kiro-pipeline-test-deployments`
- CloudWatch Dashboard: `kiro-pipeline-test-dashboard`

### Useful AWS CLI Commands

```bash
# List all CloudFormation stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Get pipeline status
aws codepipeline get-pipeline-state --name kiro-pipeline-test

# List recent builds
aws codebuild list-builds-for-project --project-name kiro-pipeline-test-build

# Query deployment history
aws dynamodb scan --table-name kiro-pipeline-test-deployments --limit 10

# Check Lambda function logs
aws logs tail /aws/lambda/kiro-pipeline-test-rollback --follow

# List SNS subscriptions
aws sns list-subscriptions

# Get CloudWatch dashboard
aws cloudwatch get-dashboard --dashboard-name kiro-pipeline-test-dashboard
```

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-27  
**Maintained By**: DevOps Team  
**Review Frequency**: Quarterly
