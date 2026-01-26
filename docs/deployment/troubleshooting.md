# Troubleshooting Guide

This document provides solutions to common issues encountered during deployment and operation of the Kiro CodeBuild Worker system.

## Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [Permission Issues](#permission-issues)
3. [CloudFormation Failures](#cloudformation-failures)
4. [Credential Configuration Issues](#credential-configuration-issues)
5. [Lambda Function Issues](#lambda-function-issues)
6. [CodeBuild Issues](#codebuild-issues)
7. [GitHub Integration Issues](#github-integration-issues)
8. [DynamoDB Lock Issues](#dynamodb-lock-issues)
9. [Monitoring and Alerting Issues](#monitoring-and-alerting-issues)
10. [General Debugging Techniques](#general-debugging-techniques)

## Deployment Issues

### Issue: CDK Bootstrap Fails

**Symptoms**:
```
Error: This stack uses assets, so the toolkit stack must be deployed to the environment
```

**Cause**: CDK is not bootstrapped in the target account/region

**Solution**:
```bash
# Bootstrap CDK
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit
```

**Prevention**: Always bootstrap CDK before first deployment in a new account/region

---

### Issue: npm install Fails

**Symptoms**:
```
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules
```

**Cause**: Insufficient permissions to install global npm packages

**Solution**:
```bash
# Option 1: Use sudo (not recommended)
sudo npm install -g aws-cdk

# Option 2: Configure npm to use user directory (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g aws-cdk
```

---

### Issue: CDK Synth Fails with TypeScript Errors

**Symptoms**:
```
Error: Compilation failed
TS2304: Cannot find name 'Stack'
```

**Cause**: Missing dependencies or TypeScript configuration issues

**Solution**:
```bash
# Reinstall dependencies
cd infrastructure
rm -rf node_modules package-lock.json
npm install

# Verify TypeScript compilation
npm run build

# Try synth again
cdk synth --context environment=test
```

---

### Issue: Stack Deployment Times Out

**Symptoms**:
```
Stack deployment timed out after 60 minutes
```

**Cause**: Large stack or slow resource creation

**Solution**:
```bash
# Deploy stacks individually with longer timeout
cdk deploy KiroWorkerCore --context environment=test --timeout 120

# Check CloudFormation events for stuck resources
aws cloudformation describe-stack-events \
  --stack-name KiroWorkerCore \
  --max-items 50
```

---

### Issue: CDK Version Mismatch

**Symptoms**:
```
Error: Cloud assembly schema version mismatch
```

**Cause**: CDK CLI version doesn't match CDK library version

**Solution**:
```bash
# Check versions
cdk --version
npm list aws-cdk-lib

# Update CDK CLI to match library
npm install -g aws-cdk@$(npm list aws-cdk-lib --depth=0 | grep aws-cdk-lib | cut -d@ -f2)

# Or update library to match CLI
cd infrastructure
npm install aws-cdk-lib@$(cdk --version | cut -d' ' -f1)
```

## Permission Issues

### Issue: Access Denied During Deployment

**Symptoms**:
```
User: arn:aws:iam::123456789012:user/deployer is not authorized to perform: cloudformation:CreateStack
```

**Cause**: Insufficient IAM permissions

**Solution**:
1. Review [iam-permissions.md](iam-permissions.md) for required permissions
2. Verify IAM policy is attached:
```bash
aws iam list-attached-user-policies --user-name deployer
```
3. Check policy document:
```bash
aws iam get-policy-version \
  --policy-arn arn:aws:iam::123456789012:policy/KiroWorkerDeploymentPolicy \
  --version-id v1
```
4. Attach missing permissions or use a role with sufficient permissions

---

### Issue: PassRole Permission Denied

**Symptoms**:
```
User is not authorized to perform: iam:PassRole on resource: arn:aws:iam::123456789012:role/KiroWorkerCodeBuildRole
```

**Cause**: Missing PassRole permission in deployment policy

**Solution**:
Add PassRole permission to deployment policy:
```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::*:role/KiroWorker*"
}
```

---

### Issue: KMS Decrypt Permission Denied

**Symptoms**:
```
User is not authorized to perform: kms:Decrypt
```

**Cause**: Missing KMS permissions or key policy doesn't allow access

**Solution**:
1. Add KMS decrypt permission to IAM policy
2. Update KMS key policy to allow user/role:
```bash
aws kms get-key-policy --key-id <key-id> --policy-name default
# Edit policy to add principal
aws kms put-key-policy --key-id <key-id> --policy-name default --policy file://key-policy.json
```

## CloudFormation Failures

### Issue: Stack Rollback on Creation

**Symptoms**:
```
Stack KiroWorkerCore failed to create: CREATE_FAILED
Status: ROLLBACK_COMPLETE
```

**Cause**: Resource creation failed during deployment

**Solution**:
1. Check CloudFormation events for specific error:
```bash
aws cloudformation describe-stack-events \
  --stack-name KiroWorkerCore \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```
2. Address the specific error (see resource-specific sections below)
3. Delete failed stack and retry:
```bash
aws cloudformation delete-stack --stack-name KiroWorkerCore
# Wait for deletion
aws cloudformation wait stack-delete-complete --stack-name KiroWorkerCore
# Retry deployment
cdk deploy KiroWorkerCore --context environment=test
```

---

### Issue: S3 Bucket Already Exists

**Symptoms**:
```
Resource creation failed: Bucket name already exists
```

**Cause**: S3 bucket names must be globally unique

**Solution**:
1. Check if bucket exists:
```bash
aws s3 ls s3://kiro-worker-test-artifacts
```
2. If it's your bucket from previous deployment, delete it:
```bash
aws s3 rb s3://kiro-worker-test-artifacts --force
```
3. If it belongs to someone else, modify bucket name in code:
```typescript
// infrastructure/lib/stacks/core-infrastructure-stack.ts
bucketName: `kiro-worker-${environment}-artifacts-${account.substring(0, 8)}`
```

---

### Issue: DynamoDB Table Already Exists

**Symptoms**:
```
Resource creation failed: Table already exists
```

**Cause**: Table from previous deployment wasn't deleted

**Solution**:
```bash
# Delete existing table
aws dynamodb delete-table --table-name kiro-worker-test-locks

# Wait for deletion
aws dynamodb wait table-not-exists --table-name kiro-worker-test-locks

# Retry deployment
cdk deploy KiroWorkerCore --context environment=test
```

---

### Issue: Lambda Function Creation Fails

**Symptoms**:
```
Resource creation failed: Code size exceeds maximum allowed
```

**Cause**: Lambda deployment package is too large

**Solution**:
1. Check package size:
```bash
cd infrastructure
npm run build
du -sh dist/
```
2. Reduce package size:
   - Remove unnecessary dependencies
   - Use Lambda layers for large dependencies
   - Exclude dev dependencies from bundle
3. Verify bundling configuration in CDK code

## Credential Configuration Issues

### Issue: Secret Not Found

**Symptoms**:
```
Secrets Manager can't find the specified secret
```

**Cause**: Secret hasn't been created or wrong secret name

**Solution**:
1. List secrets:
```bash
aws secretsmanager list-secrets --filters Key=name,Values=kiro-worker
```
2. Create secret if missing:
```bash
aws secretsmanager create-secret \
  --name kiro-worker-test-github-token \
  --secret-string "placeholder"
```
3. Verify secret ARN matches stack output

---

### Issue: Secret Value Not Populated

**Symptoms**:
```
Lambda function fails with: Secret value is empty or invalid
```

**Cause**: Secret was created but value wasn't populated

**Solution**:
```bash
# Populate secret value
aws secretsmanager put-secret-value \
  --secret-id kiro-worker-test-github-token \
  --secret-string "ghp_your_actual_token"

# Verify secret has value (returns metadata only)
aws secretsmanager describe-secret \
  --secret-id kiro-worker-test-github-token
```

---

### Issue: Invalid GitHub Token

**Symptoms**:
```
GitHub API returns 401 Unauthorized
```

**Cause**: Token is invalid, expired, or has insufficient scopes

**Solution**:
1. Test token manually:
```bash
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
```
2. If invalid, generate new token with required scopes:
   - `repo` (full control)
   - `project` (full control)
   - `read:org`
3. Update secret with new token:
```bash
aws secretsmanager put-secret-value \
  --secret-id kiro-worker-test-github-token \
  --secret-string "ghp_new_token"
```

---

### Issue: Git Credentials Format Error

**Symptoms**:
```
Failed to parse Git credentials: Invalid JSON
```

**Cause**: Git credentials secret is not valid JSON

**Solution**:
```bash
# Correct format (JSON string)
aws secretsmanager put-secret-value \
  --secret-id kiro-worker-test-git-credentials \
  --secret-string '{"username":"git","password":"your_token"}'

# Verify format
aws secretsmanager get-secret-value \
  --secret-id kiro-worker-test-git-credentials \
  --query SecretString --output text | jq .
```

## Lambda Function Issues

### Issue: Lambda Function Fails to Invoke

**Symptoms**:
```
Lambda invocation failed with error: Function not found
```

**Cause**: Function doesn't exist or wrong function name

**Solution**:
1. List Lambda functions:
```bash
aws lambda list-functions --query 'Functions[?contains(FunctionName, `kiro-worker`)].FunctionName'
```
2. Verify function name matches stack output
3. Check function exists in correct region

---

### Issue: Lambda Timeout

**Symptoms**:
```
Task timed out after 15.00 seconds
```

**Cause**: Function execution exceeds timeout limit

**Solution**:
1. Check CloudWatch logs for slow operations:
```bash
aws logs tail /aws/lambda/kiro-worker-test-poller --follow
```
2. Increase timeout in CDK code:
```typescript
timeout: cdk.Duration.minutes(15)  // Increase if needed
```
3. Optimize function code to reduce execution time

---

### Issue: Lambda Out of Memory

**Symptoms**:
```
Runtime exited with error: signal: killed
Runtime.ExitError
```

**Cause**: Function memory limit exceeded

**Solution**:
1. Check memory usage in CloudWatch logs
2. Increase memory in CDK code:
```typescript
memorySize: 512  // Increase to 1024 or higher
```
3. Optimize code to reduce memory usage

---

### Issue: Lambda Environment Variable Missing

**Symptoms**:
```
Environment variable LOCKS_TABLE_NAME is not defined
```

**Cause**: Environment variable not set in Lambda configuration

**Solution**:
1. Check Lambda configuration:
```bash
aws lambda get-function-configuration \
  --function-name kiro-worker-test-poller \
  --query Environment
```
2. Verify CDK code sets environment variables:
```typescript
environment: {
  LOCKS_TABLE_NAME: locksTable.tableName,
  GITHUB_TOKEN_SECRET_ARN: githubTokenSecret.secretArn
}
```
3. Redeploy stack to update configuration

## CodeBuild Issues

### Issue: CodeBuild Project Not Found

**Symptoms**:
```
Project not found: kiro-worker-test
```

**Cause**: Project doesn't exist or wrong project name

**Solution**:
1. List CodeBuild projects:
```bash
aws codebuild list-projects
```
2. Verify project name matches stack output
3. Check project exists in correct region

---

### Issue: CodeBuild Build Fails to Start

**Symptoms**:
```
Failed to start build: Access Denied
```

**Cause**: IAM role lacks permissions or service role not configured

**Solution**:
1. Check CodeBuild project configuration:
```bash
aws codebuild batch-get-projects --names kiro-worker-test
```
2. Verify service role has required permissions
3. Check IAM role trust policy allows CodeBuild service

---

### Issue: CodeBuild Build Times Out

**Symptoms**:
```
Build timed out after 60 minutes
```

**Cause**: Build exceeds configured timeout

**Solution**:
1. Increase timeout in CDK code:
```typescript
timeout: cdk.Duration.minutes(120)  // Increase from 60 to 120
```
2. Optimize build steps to reduce execution time
3. Check for hanging processes in build logs

---

### Issue: CodeBuild Cannot Access Git Repository

**Symptoms**:
```
fatal: could not read Username for 'https://github.com'
```

**Cause**: Git credentials not configured or invalid

**Solution**:
1. Verify Git credentials secret is populated
2. Check buildspec.yml configures Git credentials:
```yaml
pre_build:
  commands:
    - git config --global credential.helper '!aws secretsmanager get-secret-value --secret-id $GIT_CREDENTIALS_SECRET --query SecretString --output text | jq -r ".password"'
```
3. Test credentials manually

---

### Issue: CodeBuild Cannot Find buildspec.yml

**Symptoms**:
```
BUILD_CONTAINER_UNABLE_TO_PULL_IMAGE: Unable to pull customer's container image
```

**Cause**: buildspec.yml not found in repository root

**Solution**:
1. Verify buildspec.yml exists in repository:
```bash
ls -la buildspec.yml
```
2. If using custom location, update CodeBuild project:
```typescript
buildSpec: codebuild.BuildSpec.fromSourceFilename('path/to/buildspec.yml')
```
3. Commit and push buildspec.yml if missing

## GitHub Integration Issues

### Issue: GitHub API Rate Limit Exceeded

**Symptoms**:
```
API rate limit exceeded for user
```

**Cause**: Too many API requests in short time period

**Solution**:
1. Check rate limit status:
```bash
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/rate_limit
```
2. Wait for rate limit reset (shown in response)
3. Implement exponential backoff in code (already implemented)
4. Use authenticated requests (higher rate limit)

---

### Issue: GitHub Project Not Found

**Symptoms**:
```
Could not resolve to a ProjectV2 with the number 1
```

**Cause**: Project number is incorrect or project doesn't exist

**Solution**:
1. Verify project exists and get correct number:
   - Go to GitHub Project URL
   - Number is in URL: `github.com/orgs/ORG/projects/NUMBER`
2. Update Parameter Store with correct number:
```bash
aws ssm put-parameter \
  --name /kiro-worker/test/github-project-config \
  --type String \
  --value '{"organization":"your-org","repository":"your-repo","projectNumber":1,"targetStatusColumn":"For Implementation"}' \
  --overwrite
```

---

### Issue: Work Items Not Found

**Symptoms**:
```
No work items found in target status column
```

**Cause**: Status column name doesn't match or no items in that status

**Solution**:
1. Verify status column name in GitHub Project
2. Check work items exist in that column
3. Update configuration with correct column name:
```bash
aws ssm put-parameter \
  --name /kiro-worker/test/github-project-config \
  --type String \
  --value '{"organization":"your-org","repository":"your-repo","projectNumber":1,"targetStatusColumn":"Ready for Implementation"}' \
  --overwrite
```

---

### Issue: Branch Not Found

**Symptoms**:
```
Branch 'feature/my-feature' not found in repository
```

**Cause**: Branch doesn't exist or work item has incorrect branch name

**Solution**:
1. Verify branch exists:
```bash
git ls-remote --heads origin feature/my-feature
```
2. Create branch if missing:
```bash
git checkout -b feature/my-feature
git push origin feature/my-feature
```
3. Update work item with correct branch name

---

### Issue: Spec Files Not Found

**Symptoms**:
```
Spec folder not found: .kiro/specs/feature-my-feature
```

**Cause**: Spec files don't exist in expected location

**Solution**:
1. Create spec folder structure:
```bash
mkdir -p .kiro/specs/feature-my-feature
```
2. Create required files:
```bash
touch .kiro/specs/feature-my-feature/requirements.md
touch .kiro/specs/feature-my-feature/design.md
touch .kiro/specs/feature-my-feature/tasks.md
```
3. Commit and push:
```bash
git add .kiro/specs/
git commit -m "feat: add spec files for my-feature"
git push origin feature/my-feature
```

---

### Issue: Pull Request Not Found

**Symptoms**:
```
No pull request found for branch 'feature/my-feature'
```

**Cause**: Pull request doesn't exist for the branch

**Solution**:
1. Create pull request:
```bash
gh pr create --base main --head feature/my-feature --title "My Feature" --body "Description"
```
2. Or create via GitHub UI
3. Verify PR exists:
```bash
gh pr list --head feature/my-feature
```

## DynamoDB Lock Issues

### Issue: Lock Acquisition Fails

**Symptoms**:
```
Failed to acquire lock: ConditionalCheckFailedException
```

**Cause**: Another execution already holds the lock

**Solution**:
This is expected behavior when another build is in progress. The system will:
1. Log "Work already in progress"
2. Skip this execution
3. Try again on next scheduled trigger

If lock is stuck:
```bash
# Check lock status
aws dynamodb get-item \
  --table-name kiro-worker-test-locks \
  --key '{"lockKey":{"S":"work-item-processor-lock"}}'

# If expired, delete manually
aws dynamodb delete-item \
  --table-name kiro-worker-test-locks \
  --key '{"lockKey":{"S":"work-item-processor-lock"}}'
```

---

### Issue: Lock Not Released

**Symptoms**:
```
Lock remains after build completes
```

**Cause**: Build crashed or timed out before releasing lock

**Solution**:
Locks have TTL (2 hours) and will expire automatically. To manually release:
```bash
aws dynamodb delete-item \
  --table-name kiro-worker-test-locks \
  --key '{"lockKey":{"S":"work-item-processor-lock"}}'
```

---

### Issue: DynamoDB Throttling

**Symptoms**:
```
ProvisionedThroughputExceededException
```

**Cause**: Too many requests to DynamoDB table

**Solution**:
1. Check table capacity mode:
```bash
aws dynamodb describe-table --table-name kiro-worker-test-locks
```
2. If provisioned, increase capacity or switch to on-demand:
```typescript
billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
```
3. Implement exponential backoff (already implemented)

## Monitoring and Alerting Issues

### Issue: CloudWatch Alarms Not Triggering

**Symptoms**:
```
Alarm should trigger but doesn't send notification
```

**Cause**: Alarm configuration or SNS subscription issue

**Solution**:
1. Check alarm state:
```bash
aws cloudwatch describe-alarms --alarm-names kiro-worker-test-build-failures
```
2. Verify alarm actions are configured:
```bash
aws cloudwatch describe-alarms \
  --alarm-names kiro-worker-test-build-failures \
  --query 'MetricAlarms[0].AlarmActions'
```
3. Check SNS subscription is confirmed:
```bash
aws sns list-subscriptions-by-topic --topic-arn <topic-arn>
```
4. Confirm email subscription if pending

---

### Issue: SNS Email Not Received

**Symptoms**:
```
Alarm triggers but no email received
```

**Cause**: Email subscription not confirmed or email filtered

**Solution**:
1. Check subscription status:
```bash
aws sns list-subscriptions-by-topic --topic-arn <topic-arn>
```
2. If pending confirmation, check email for confirmation link
3. Check spam/junk folder
4. Resend confirmation:
```bash
aws sns subscribe \
  --topic-arn <topic-arn> \
  --protocol email \
  --notification-endpoint your-email@example.com
```

---

### Issue: CloudWatch Logs Not Appearing

**Symptoms**:
```
No logs in CloudWatch for Lambda or CodeBuild
```

**Cause**: IAM permissions or log group configuration issue

**Solution**:
1. Verify log group exists:
```bash
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/kiro-worker
```
2. Check IAM role has CloudWatch Logs permissions
3. Verify log retention is set:
```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/kiro-worker-test-poller \
  --retention-in-days 7
```

## General Debugging Techniques

### Enable Verbose Logging

Add debug logging to Lambda functions:
```typescript
console.log('DEBUG:', JSON.stringify(event, null, 2));
```

### Check CloudWatch Logs

```bash
# Tail Lambda logs
aws logs tail /aws/lambda/kiro-worker-test-poller --follow

# Tail CodeBuild logs
aws logs tail /aws/codebuild/kiro-worker-test --follow

# Search logs for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/kiro-worker-test-poller \
  --filter-pattern "ERROR"
```

### Use AWS X-Ray

Enable X-Ray tracing for Lambda:
```typescript
tracing: lambda.Tracing.ACTIVE
```

View traces in AWS Console:
- Go to X-Ray → Traces
- Filter by function name
- Analyze slow operations

### Test Components Individually

Test Lambda function:
```bash
aws lambda invoke \
  --function-name kiro-worker-test-poller \
  --payload '{}' \
  response.json
cat response.json
```

Test CodeBuild project:
```bash
aws codebuild start-build \
  --project-name kiro-worker-test \
  --environment-variables-override name=BRANCH_NAME,value=feature/test
```

### Review CloudFormation Events

```bash
# Get recent events
aws cloudformation describe-stack-events \
  --stack-name KiroWorkerCore \
  --max-items 20

# Filter for failures
aws cloudformation describe-stack-events \
  --stack-name KiroWorkerCore \
  --query 'StackEvents[?contains(ResourceStatus, `FAILED`)]'
```

### Use CDK Diff

Before deploying changes, review differences:
```bash
cdk diff --context environment=test
```

### Validate IAM Policies

Use IAM Policy Simulator:
```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/KiroWorkerCodeBuildRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::kiro-worker-test-artifacts/*
```

## Getting Additional Help

If issues persist after trying these solutions:

1. **Check AWS Service Health Dashboard**: https://status.aws.amazon.com/
2. **Review AWS Documentation**: Service-specific documentation
3. **Search GitHub Issues**: Check if others have encountered similar issues
4. **Create GitHub Issue**: Provide detailed error messages and logs
5. **Contact AWS Support**: For AWS service-specific issues
6. **Enable Debug Logging**: Add verbose logging and share logs

## Troubleshooting Checklist

When encountering an issue:

- [ ] Check error message and stack trace
- [ ] Review CloudWatch logs
- [ ] Verify IAM permissions
- [ ] Check resource exists (S3 bucket, DynamoDB table, etc.)
- [ ] Verify configuration (secrets, parameters)
- [ ] Test components individually
- [ ] Review CloudFormation events
- [ ] Check AWS service health
- [ ] Search documentation and GitHub issues
- [ ] Enable debug logging
- [ ] Create minimal reproduction case
- [ ] Document steps taken and results

## Prevention Best Practices

To avoid common issues:

1. **Use Infrastructure as Code**: Always deploy via CDK, never manual changes
2. **Test in Non-Production First**: Deploy to test environment before production
3. **Review Changes**: Use `cdk diff` before deploying
4. **Monitor Deployments**: Watch CloudFormation events during deployment
5. **Validate Permissions**: Test permissions before deployment
6. **Document Changes**: Keep deployment documentation updated
7. **Use Version Control**: Track all infrastructure changes in Git
8. **Implement Rollback Plan**: Know how to rollback before deploying
9. **Set Up Alerts**: Configure CloudWatch alarms for critical metrics
10. **Regular Audits**: Review logs and metrics regularly
