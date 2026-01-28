#!/bin/bash

# CD Pipeline Deployment Validation Script
# Validates that all CD Pipeline resources are deployed correctly
# Usage: ENVIRONMENT=test ./validate-deployment.sh

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation result tracking
VALIDATION_PASSED=0
VALIDATION_FAILED=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((VALIDATION_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((VALIDATION_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Print script header
echo "========================================="
echo "  CD Pipeline Validation Script"
echo "========================================="
echo ""

# Validate environment variable
if [ -z "${ENVIRONMENT:-}" ]; then
    log_fail "ENVIRONMENT variable is not set"
    echo "Usage: ENVIRONMENT=test ./validate-deployment.sh"
    echo "Valid values: test, staging, production"
    exit 1
fi

# Validate environment value
case "$ENVIRONMENT" in
    test|staging|production)
        log_info "Validating environment: $ENVIRONMENT"
        ;;
    *)
        log_fail "Invalid ENVIRONMENT value: $ENVIRONMENT"
        echo "Valid values: test, staging, production"
        exit 1
        ;;
esac

# Get AWS region
AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")
log_info "AWS Region: $AWS_REGION"
echo ""

# Check 1: Pipeline Existence
log_info "Check 1: Validating CodePipeline existence..."

PIPELINE_NAME="kiro-pipeline-${ENVIRONMENT}"
PIPELINE_STATUS=$(aws codepipeline get-pipeline \
    --name "$PIPELINE_NAME" \
    --region "$AWS_REGION" \
    --query 'pipeline.name' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$PIPELINE_STATUS" == "$PIPELINE_NAME" ]; then
    log_pass "CodePipeline exists: $PIPELINE_NAME"
else
    log_fail "CodePipeline not found: $PIPELINE_NAME"
fi

echo ""

# Check 2: CodeBuild Projects
log_info "Check 2: Validating CodeBuild projects..."

# Define expected CodeBuild project names
CODEBUILD_PROJECTS=(
    "kiro-pipeline-${ENVIRONMENT}-build"
    "kiro-pipeline-${ENVIRONMENT}-integration-test"
    "kiro-pipeline-${ENVIRONMENT}-e2e-test"
    "kiro-pipeline-${ENVIRONMENT}-deploy-test"
    "kiro-pipeline-${ENVIRONMENT}-deploy-staging"
    "kiro-pipeline-${ENVIRONMENT}-deploy-production"
)

# Check each CodeBuild project
for project_name in "${CODEBUILD_PROJECTS[@]}"; do
    PROJECT_EXISTS=$(aws codebuild batch-get-projects \
        --names "$project_name" \
        --region "$AWS_REGION" \
        --query 'projects[0].name' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$PROJECT_EXISTS" == "$project_name" ]; then
        log_pass "CodeBuild project exists: $project_name"
    else
        log_fail "CodeBuild project not found: $project_name"
    fi
done

echo ""

# Check 3: S3 Artifacts Bucket
log_info "Check 3: Validating S3 artifacts bucket..."

BUCKET_NAME="kiro-pipeline-${ENVIRONMENT}-artifacts"

# Check if bucket exists
BUCKET_EXISTS=$(aws s3api head-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$AWS_REGION" 2>&1 || echo "NOT_FOUND")

if [[ "$BUCKET_EXISTS" != *"NOT_FOUND"* ]] && [[ "$BUCKET_EXISTS" != *"NoSuchBucket"* ]]; then
    log_pass "S3 bucket exists: $BUCKET_NAME"
    
    # Check encryption
    ENCRYPTION=$(aws s3api get-bucket-encryption \
        --bucket "$BUCKET_NAME" \
        --region "$AWS_REGION" \
        --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
        --output text 2>/dev/null || echo "NONE")
    
    if [ "$ENCRYPTION" == "aws:kms" ] || [ "$ENCRYPTION" == "AES256" ]; then
        log_pass "S3 bucket has encryption enabled: $ENCRYPTION"
    else
        log_fail "S3 bucket encryption not configured properly: $ENCRYPTION"
    fi
else
    log_fail "S3 bucket not found: $BUCKET_NAME"
fi

echo ""

# Check 4: DynamoDB Deployments Table
log_info "Check 4: Validating DynamoDB deployments table..."

TABLE_NAME="kiro-pipeline-${ENVIRONMENT}-deployments"

# Check if table exists
TABLE_STATUS=$(aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --query 'Table.TableStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$TABLE_STATUS" == "ACTIVE" ]; then
    log_pass "DynamoDB table exists and is active: $TABLE_NAME"
    
    # Check for GSI
    GSI_COUNT=$(aws dynamodb describe-table \
        --table-name "$TABLE_NAME" \
        --region "$AWS_REGION" \
        --query 'length(Table.GlobalSecondaryIndexes)' \
        --output text 2>/dev/null || echo "0")
    
    if [ "$GSI_COUNT" -gt 0 ]; then
        log_pass "DynamoDB table has Global Secondary Index (GSI)"
    else
        log_fail "DynamoDB table missing Global Secondary Index (GSI)"
    fi
    
    # Check for TTL
    TTL_STATUS=$(aws dynamodb describe-time-to-live \
        --table-name "$TABLE_NAME" \
        --region "$AWS_REGION" \
        --query 'TimeToLiveDescription.TimeToLiveStatus' \
        --output text 2>/dev/null || echo "DISABLED")
    
    if [ "$TTL_STATUS" == "ENABLED" ]; then
        log_pass "DynamoDB table has TTL enabled"
    else
        log_fail "DynamoDB table TTL not enabled: $TTL_STATUS"
    fi
else
    log_fail "DynamoDB table not found or not active: $TABLE_NAME (Status: $TABLE_STATUS)"
fi

echo ""

# Check 5: Rollback Lambda Function
log_info "Check 5: Validating rollback Lambda function..."

LAMBDA_NAME="kiro-pipeline-${ENVIRONMENT}-rollback"

LAMBDA_EXISTS=$(aws lambda get-function \
    --function-name "$LAMBDA_NAME" \
    --region "$AWS_REGION" \
    --query 'Configuration.FunctionName' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$LAMBDA_EXISTS" == "$LAMBDA_NAME" ]; then
    log_pass "Lambda function exists: $LAMBDA_NAME"
else
    log_fail "Lambda function not found: $LAMBDA_NAME"
fi

echo ""

# Check 6: SNS Topics
log_info "Check 6: Validating SNS topics..."

# Define expected SNS topic names
SNS_TOPICS=(
    "kiro-pipeline-${ENVIRONMENT}-deployments"
    "kiro-pipeline-${ENVIRONMENT}-approvals"
    "kiro-pipeline-${ENVIRONMENT}-rollbacks"
)

# Check each SNS topic
for topic_suffix in "deployments" "approvals" "rollbacks"; do
    topic_name="kiro-pipeline-${ENVIRONMENT}-${topic_suffix}"
    
    # List topics and filter by name
    TOPIC_ARN=$(aws sns list-topics \
        --region "$AWS_REGION" \
        --query "Topics[?contains(TopicArn, '${topic_name}')].TopicArn" \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$TOPIC_ARN" ]; then
        log_pass "SNS topic exists: $topic_name"
    else
        log_fail "SNS topic not found: $topic_name"
    fi
done

echo ""

# Summary
echo "========================================="
echo "  Validation Summary"
echo "========================================="
echo ""
echo "Environment:       $ENVIRONMENT"
echo "AWS Region:        $AWS_REGION"
echo ""
echo "Checks Passed:     $VALIDATION_PASSED"
echo "Checks Failed:     $VALIDATION_FAILED"
echo ""

if [ $VALIDATION_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All validation checks passed!${NC}"
    echo "========================================="
    exit 0
else
    echo -e "${RED}✗ Some validation checks failed${NC}"
    echo ""
    echo "Please review the failed checks above and:"
    echo "  1. Verify the deployment completed successfully"
    echo "  2. Check CloudFormation console for stack status"
    echo "  3. Review CloudFormation events for errors"
    echo "  4. Re-run deployment if necessary"
    echo "========================================="
    exit 1
fi
