# Validate Deployment Script Documentation

## Overview

The `validate-deployment.sh` script validates that all CD Pipeline resources are deployed correctly in AWS. It performs comprehensive checks on all infrastructure components and reports pass/fail status for each check.

## Location

```
infrastructure/validate-deployment.sh
```

## Usage

```bash
ENVIRONMENT=test ./validate-deployment.sh
ENVIRONMENT=staging ./validate-deployment.sh
ENVIRONMENT=production ./validate-deployment.sh
```

## Prerequisites

- AWS CLI installed and configured
- Valid AWS credentials with read permissions for:
  - CodePipeline
  - CodeBuild
  - S3
  - DynamoDB
  - Lambda
  - SNS
- ENVIRONMENT variable set to: `test`, `staging`, or `production`

## Validation Checks

The script performs the following validation checks:

### Check 1: CodePipeline Existence

Validates that the CodePipeline exists:
- Pipeline name: `kiro-pipeline-{environment}`
- Uses: `aws codepipeline get-pipeline`

### Check 2: CodeBuild Projects (6 projects)

Validates that all CodeBuild projects exist:
1. `kiro-pipeline-{environment}-build` - Build and test stage
2. `kiro-pipeline-{environment}-integration-test` - Integration tests
3. `kiro-pipeline-{environment}-e2e-test` - End-to-end tests
4. `kiro-pipeline-{environment}-deploy-test` - Test environment deployment
5. `kiro-pipeline-{environment}-deploy-staging` - Staging environment deployment
6. `kiro-pipeline-{environment}-deploy-production` - Production environment deployment

Uses: `aws codebuild batch-get-projects`

### Check 3: S3 Artifacts Bucket

Validates the S3 bucket for pipeline artifacts:
- Bucket name: `kiro-pipeline-{environment}-artifacts`
- Checks bucket existence
- Verifies encryption is enabled (KMS or AES256)

Uses: `aws s3api head-bucket`, `aws s3api get-bucket-encryption`

### Check 4: DynamoDB Deployments Table

Validates the DynamoDB table for deployment tracking:
- Table name: `kiro-pipeline-{environment}-deployments`
- Checks table exists and is ACTIVE
- Verifies Global Secondary Index (GSI) exists
- Verifies Time-To-Live (TTL) is enabled

Uses: `aws dynamodb describe-table`, `aws dynamodb describe-time-to-live`

### Check 5: Rollback Lambda Function

Validates the Lambda function for automated rollback:
- Function name: `kiro-pipeline-{environment}-rollback`

Uses: `aws lambda get-function`

### Check 6: SNS Topics (3 topics)

Validates all SNS notification topics:
1. `kiro-pipeline-{environment}-deployments` - Deployment notifications
2. `kiro-pipeline-{environment}-approvals` - Approval requests
3. `kiro-pipeline-{environment}-rollbacks` - Rollback notifications

Uses: `aws sns list-topics`

## Output

The script provides:
- Colored output for easy reading (INFO, PASS, FAIL, WARNING)
- Progress indication for each check
- Summary of validation results
- Count of passed and failed checks
- Troubleshooting guidance on failure

### Example Output (Success)

```
=========================================
  CD Pipeline Validation Script
=========================================

[INFO] Validating environment: test
[INFO] AWS Region: us-east-1

[INFO] Check 1: Validating CodePipeline existence...
[PASS] CodePipeline exists: kiro-pipeline-test

[INFO] Check 2: Validating CodeBuild projects...
[PASS] CodeBuild project exists: kiro-pipeline-test-build
[PASS] CodeBuild project exists: kiro-pipeline-test-integration-test
[PASS] CodeBuild project exists: kiro-pipeline-test-e2e-test
[PASS] CodeBuild project exists: kiro-pipeline-test-deploy-test
[PASS] CodeBuild project exists: kiro-pipeline-test-deploy-staging
[PASS] CodeBuild project exists: kiro-pipeline-test-deploy-production

[INFO] Check 3: Validating S3 artifacts bucket...
[PASS] S3 bucket exists: kiro-pipeline-test-artifacts
[PASS] S3 bucket has encryption enabled: aws:kms

[INFO] Check 4: Validating DynamoDB deployments table...
[PASS] DynamoDB table exists and is active: kiro-pipeline-test-deployments
[PASS] DynamoDB table has Global Secondary Index (GSI)
[PASS] DynamoDB table has TTL enabled

[INFO] Check 5: Validating rollback Lambda function...
[PASS] Lambda function exists: kiro-pipeline-test-rollback

[INFO] Check 6: Validating SNS topics...
[PASS] SNS topic exists: kiro-pipeline-test-deployments
[PASS] SNS topic exists: kiro-pipeline-test-approvals
[PASS] SNS topic exists: kiro-pipeline-test-rollbacks

=========================================
  Validation Summary
=========================================

Environment:       test
AWS Region:        us-east-1

Checks Passed:     15
Checks Failed:     0

✓ All validation checks passed!
=========================================
```

### Example Output (Failure)

```
=========================================
  CD Pipeline Validation Script
=========================================

[INFO] Validating environment: test
[INFO] AWS Region: us-east-1

[INFO] Check 1: Validating CodePipeline existence...
[FAIL] CodePipeline not found: kiro-pipeline-test

...

=========================================
  Validation Summary
=========================================

Environment:       test
AWS Region:        us-east-1

Checks Passed:     10
Checks Failed:     5

✗ Some validation checks failed

Please review the failed checks above and:
  1. Verify the deployment completed successfully
  2. Check CloudFormation console for stack status
  3. Review CloudFormation events for errors
  4. Re-run deployment if necessary
=========================================
```

## Exit Codes

- `0` - All validation checks passed
- `1` - One or more validation checks failed or invalid environment

## Error Handling

The script includes comprehensive error handling:
- Validates ENVIRONMENT variable is set and valid
- Handles AWS CLI errors gracefully
- Continues checking all resources even if some fail
- Provides clear error messages for troubleshooting

## Integration

This script is automatically called by `deploy-pipeline.sh` after stack deployment to verify the deployment was successful.

## Testing

The script is tested with comprehensive unit tests in:
```
infrastructure/test/scripts/validate-deployment.test.ts
```

Test coverage includes:
- Script existence and permissions
- Environment variable validation
- All resource validation checks
- Output and logging
- Exit codes
- Error handling
- AWS region handling
- Script structure
- Resource naming conventions
- Validation logic
- Documentation
- Integration with deploy-pipeline.sh

## Troubleshooting

### ENVIRONMENT variable not set

**Error**: `ENVIRONMENT variable is not set`

**Solution**: Set the ENVIRONMENT variable before running:
```bash
ENVIRONMENT=test ./validate-deployment.sh
```

### AWS CLI not configured

**Error**: Failed to get AWS account ID or region

**Solution**: Configure AWS CLI:
```bash
aws configure
```

### Permission denied

**Error**: Permission denied when executing script

**Solution**: Make script executable:
```bash
chmod +x infrastructure/validate-deployment.sh
```

### Resource not found

**Error**: `[FAIL] {Resource} not found`

**Solution**: 
1. Verify the deployment completed successfully
2. Check CloudFormation console for stack status
3. Ensure you're using the correct environment
4. Re-run deployment if necessary

## Maintenance

When adding new resources to the CD Pipeline:
1. Add validation check to the script
2. Update this documentation
3. Add corresponding tests to `validate-deployment.test.ts`
4. Ensure tests achieve ≥80% coverage

## Related Documentation

- [CD Pipeline Deployment Guide](./cd-pipeline-deployment.md)
- [Deploy Pipeline Script](../deploy-pipeline.sh)
- [CD Pipeline Design](../../.kiro/specs/cd-pipeline/design.md)
