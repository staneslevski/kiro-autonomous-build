# Setup Parameters Script Documentation

## Overview

The `setup-parameters.sh` script creates and manages parameters in AWS Systems Manager Parameter Store for the CD Pipeline. These parameters configure the pipeline's behavior across different environments (test, staging, production).

## Location

```
infrastructure/scripts/setup-parameters.sh
```

## Purpose

This script:
1. Creates GitHub configuration parameters (owner and repository name)
2. Creates environment-specific alarm threshold parameters
3. Creates environment-specific timeout parameters
4. Validates AWS credentials and environment configuration
5. Checks for existing parameters before creating new ones
6. Provides instructions for updating parameter values

## Prerequisites

- AWS CLI installed and configured
- AWS credentials with permissions to:
  - Create and read SSM parameters (`ssm:PutParameter`, `ssm:GetParameter`)
  - Get caller identity (`sts:GetCallerIdentity`)
- Valid environment value (test, staging, or production)

## Usage

```bash
ENVIRONMENT=test ./scripts/setup-parameters.sh
```

### Environment Values

- `test`: Development and testing environment
- `staging`: Pre-production validation environment
- `production`: Live production environment

## Parameters Created

### GitHub Configuration (REQUIRED)

These parameters are required for the pipeline to access your GitHub repository:

1. **GitHub Owner** (`/kiro-pipeline/{env}/github-owner`)
   - Description: GitHub repository owner/organization
   - Type: String
   - Default: `PLACEHOLDER_GITHUB_OWNER`
   - **Action Required**: Update with your GitHub organization or username

2. **GitHub Repository** (`/kiro-pipeline/{env}/github-repo`)
   - Description: GitHub repository name
   - Type: String
   - Default: `PLACEHOLDER_GITHUB_REPO`
   - **Action Required**: Update with your repository name

### Alarm Thresholds (OPTIONAL)

These parameters configure CloudWatch alarm thresholds. Default values are environment-specific:

1. **Pipeline Failure Threshold** (`/kiro-pipeline/{env}/alarm-threshold-pipeline-failures`)
   - Description: Number of pipeline failures before alarm triggers
   - Type: String
   - Defaults:
     - test: `5` (more lenient)
     - staging: `3`
     - production: `3`

2. **Rollback Count Threshold** (`/kiro-pipeline/{env}/alarm-threshold-rollback-count`)
   - Description: Number of rollbacks before alarm triggers
   - Type: String
   - Defaults:
     - test: `5` (more lenient)
     - staging: `3`
     - production: `2` (strictest)

3. **Deployment Duration Threshold** (`/kiro-pipeline/{env}/alarm-threshold-deployment-duration`)
   - Description: Maximum deployment duration in minutes before alarm triggers
   - Type: String
   - Defaults:
     - test: `90` minutes (most lenient)
     - staging: `75` minutes
     - production: `60` minutes (strictest)

### Timeouts (OPTIONAL)

These parameters configure various timeout values:

1. **Health Check Duration** (`/kiro-pipeline/{env}/health-check-duration`)
   - Description: Duration to monitor health checks after deployment (minutes)
   - Type: String
   - Defaults:
     - test: `5` minutes
     - staging: `5` minutes
     - production: `10` minutes (longer monitoring)

2. **Approval Timeout** (`/kiro-pipeline/{env}/approval-timeout`)
   - Description: Maximum time to wait for manual approval (hours)
   - Type: String
   - Default: `24` hours (all environments)

3. **Rollback Timeout** (`/kiro-pipeline/{env}/rollback-timeout`)
   - Description: Maximum time for rollback execution (minutes)
   - Type: String
   - Default: `15` minutes (all environments)

## Script Behavior

### Existing Parameters

If a parameter already exists:
- The script will **not** overwrite it
- It will display the current value
- It will warn if the value differs from the default
- You must manually update existing parameters if needed

### Error Handling

The script will exit with error code 1 if:
- `ENVIRONMENT` variable is not set or invalid
- AWS CLI is not installed
- AWS credentials are not configured
- Required parameter creation fails (GitHub owner/repo)

The script will continue with warnings if:
- Optional parameter creation fails (alarm thresholds, timeouts)

## Post-Setup Steps

### 1. Update GitHub Configuration (REQUIRED)

After running the script, you **must** update the GitHub parameters with actual values:

```bash
# Update GitHub owner/organization
aws ssm put-parameter \
  --name /kiro-pipeline/test/github-owner \
  --value 'your-github-org' \
  --overwrite \
  --region us-east-1

# Update GitHub repository name
aws ssm put-parameter \
  --name /kiro-pipeline/test/github-repo \
  --value 'your-repo-name' \
  --overwrite \
  --region us-east-1
```

### 2. Review Alarm Thresholds (OPTIONAL)

The default alarm thresholds are set based on environment best practices. You can adjust them:

```bash
# Example: Adjust pipeline failure threshold
aws ssm put-parameter \
  --name /kiro-pipeline/test/alarm-threshold-pipeline-failures \
  --value '10' \
  --overwrite \
  --region us-east-1
```

### 3. Review Timeouts (OPTIONAL)

The default timeouts are set based on environment requirements. You can adjust them:

```bash
# Example: Adjust health check duration
aws ssm put-parameter \
  --name /kiro-pipeline/test/health-check-duration \
  --value '7' \
  --overwrite \
  --region us-east-1
```

### 4. Verify Parameters

Verify all parameters are configured correctly:

```bash
aws ssm get-parameters-by-path \
  --path /kiro-pipeline/test \
  --region us-east-1
```

### 5. Deploy Pipeline

After updating required parameters, deploy the pipeline:

```bash
ENVIRONMENT=test ./deploy-pipeline.sh
```

## Examples

### Complete Setup for Test Environment

```bash
# 1. Run setup script
ENVIRONMENT=test ./scripts/setup-parameters.sh

# 2. Update GitHub configuration
aws ssm put-parameter \
  --name /kiro-pipeline/test/github-owner \
  --value 'my-org' \
  --overwrite \
  --region us-east-1

aws ssm put-parameter \
  --name /kiro-pipeline/test/github-repo \
  --value 'kiro-codebuild-worker' \
  --overwrite \
  --region us-east-1

# 3. Verify parameters
aws ssm get-parameters-by-path \
  --path /kiro-pipeline/test \
  --region us-east-1

# 4. Deploy pipeline
ENVIRONMENT=test ./deploy-pipeline.sh
```

### Update Existing Parameter

```bash
# Update a specific parameter
aws ssm put-parameter \
  --name /kiro-pipeline/production/alarm-threshold-rollback-count \
  --value '1' \
  --overwrite \
  --region us-east-1
```

### List All Parameters for Environment

```bash
# List all parameters for production
aws ssm get-parameters-by-path \
  --path /kiro-pipeline/production \
  --recursive \
  --region us-east-1
```

## Troubleshooting

### Error: "ENVIRONMENT variable is not set"

**Cause**: The `ENVIRONMENT` variable was not provided.

**Solution**: Run the script with the environment variable:
```bash
ENVIRONMENT=test ./scripts/setup-parameters.sh
```

### Error: "AWS CLI is not installed"

**Cause**: AWS CLI is not installed on your system.

**Solution**: Install AWS CLI:
```bash
# macOS
brew install awscli

# Linux
pip install awscli

# Or download from: https://aws.amazon.com/cli/
```

### Error: "Failed to get AWS account ID"

**Cause**: AWS credentials are not configured.

**Solution**: Configure AWS credentials:
```bash
aws configure
```

### Warning: "Parameter already exists"

**Cause**: The parameter was created in a previous run.

**Behavior**: The script will not overwrite existing parameters. This is intentional to prevent accidental data loss.

**Action**: If you need to update the parameter, use the `aws ssm put-parameter` command with `--overwrite` flag as shown in the script output.

### Error: "Failed to create GitHub owner parameter"

**Cause**: Insufficient IAM permissions or AWS service issue.

**Solution**: 
1. Verify your IAM user/role has `ssm:PutParameter` permission
2. Check AWS service health status
3. Verify the parameter name doesn't conflict with existing parameters

## Security Considerations

### Placeholder Values

The script creates parameters with placeholder values (`PLACEHOLDER_*`) that **must** be replaced with actual values. Never use placeholder values in production.

### Parameter Tagging

All parameters are tagged with:
- `Environment`: The environment name (test, staging, production)
- `ManagedBy`: Script
- `Project`: KiroWorker

These tags help with:
- Cost allocation
- Resource organization
- Compliance tracking

### IAM Permissions

The script requires minimal IAM permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:PutParameter",
        "ssm:GetParameter",
        "ssm:AddTagsToResource"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/kiro-pipeline/*"
    },
    {
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}
```

## Integration with Pipeline

The parameters created by this script are used by:

1. **CD Pipeline Stack**: Reads GitHub owner and repo for source configuration
2. **Monitoring Stack**: Uses alarm thresholds for CloudWatch alarm configuration
3. **Rollback Lambda**: Uses timeout values for rollback execution
4. **Health Check Monitor**: Uses health check duration for post-deployment monitoring

## Related Documentation

- [Setup Secrets Script](./setup-secrets-script.md) - Creates secrets in AWS Secrets Manager
- [Deploy Pipeline Script](./deploy-pipeline-script.md) - Deploys the CD pipeline infrastructure
- [Validate Deployment Script](./validate-deployment-script.md) - Validates pipeline deployment

## Maintenance

### Updating Default Values

To change default parameter values:

1. Edit `infrastructure/scripts/setup-parameters.sh`
2. Modify the case statements for environment-specific values
3. Update this documentation to reflect new defaults
4. Test the script in a non-production environment
5. Update existing parameters manually if needed

### Adding New Parameters

To add new parameters:

1. Add parameter creation logic to the script
2. Follow the existing pattern (check existence, create, provide update instructions)
3. Add tests to `infrastructure/test/scripts/setup-parameters.test.ts`
4. Update this documentation
5. Update related pipeline components to use the new parameter

## Testing

The script is tested in `infrastructure/test/scripts/setup-parameters.test.ts` with:
- 71 test cases covering all functionality
- Script existence and permissions validation
- Content validation (all parameters, error handling, logging)
- Environment-specific configuration validation
- Integration with pipeline validation
- Property-based tests for naming conventions

Run tests:
```bash
cd infrastructure
npm test -- setup-parameters.test.ts
```
