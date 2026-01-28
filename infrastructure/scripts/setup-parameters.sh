#!/bin/bash

# CD Pipeline Parameters Setup Script
# Creates parameters in AWS Systems Manager Parameter Store for the CD Pipeline
# Usage: ENVIRONMENT=test ./scripts/setup-parameters.sh

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print script header
echo "========================================="
echo "  CD Pipeline Parameters Setup Script"
echo "========================================="
echo ""

# Step 1: Validate environment variable
log_info "Step 1: Validating environment..."

if [ -z "${ENVIRONMENT:-}" ]; then
    log_error "ENVIRONMENT variable is not set"
    log_error "Usage: ENVIRONMENT=test ./scripts/setup-parameters.sh"
    log_error "Valid values: test, staging, production"
    exit 1
fi

# Validate environment value
case "$ENVIRONMENT" in
    test|staging|production)
        log_success "Environment validated: $ENVIRONMENT"
        ;;
    *)
        log_error "Invalid ENVIRONMENT value: $ENVIRONMENT"
        log_error "Valid values: test, staging, production"
        exit 1
        ;;
esac

# Step 2: Check AWS CLI is installed
log_info "Step 2: Checking AWS CLI..."

if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed"
    log_error "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

log_success "AWS CLI is installed"

# Step 3: Get AWS account and region
log_info "Step 3: Getting AWS account information..."

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")

if [ -z "$AWS_ACCOUNT_ID" ]; then
    log_error "Failed to get AWS account ID"
    log_error "Please configure AWS credentials: aws configure"
    exit 1
fi

log_success "AWS Account ID: $AWS_ACCOUNT_ID"
log_success "AWS Region: $AWS_REGION"
echo ""

# Function to create or update a parameter
create_or_update_parameter() {
    local parameter_name=$1
    local parameter_description=$2
    local parameter_value=$3
    local parameter_type=$4
    local is_required=$5
    
    log_info "Processing parameter: $parameter_name..."
    
    # Check if parameter already exists
    PARAMETER_EXISTS=$(aws ssm get-parameter \
        --name "$parameter_name" \
        --region "$AWS_REGION" \
        --query 'Parameter.Name' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$PARAMETER_EXISTS" != "NOT_FOUND" ]; then
        log_warning "Parameter already exists: $parameter_name"
        
        # Get the current parameter value
        CURRENT_VALUE=$(aws ssm get-parameter \
            --name "$parameter_name" \
            --region "$AWS_REGION" \
            --query 'Parameter.Value' \
            --output text 2>/dev/null)
        
        log_info "Current value: $CURRENT_VALUE"
        
        if [ "$CURRENT_VALUE" != "$parameter_value" ]; then
            log_warning "Parameter has a different value than default"
            log_warning "Keeping existing value. Update manually if needed."
        else
            log_success "Parameter has expected value"
        fi
        
        return 0
    fi
    
    # Create new parameter
    log_info "Creating new parameter: $parameter_name..."
    
    CREATE_OUTPUT=$(aws ssm put-parameter \
        --name "$parameter_name" \
        --description "$parameter_description" \
        --value "$parameter_value" \
        --type "$parameter_type" \
        --region "$AWS_REGION" \
        --tags Key=Environment,Value="$ENVIRONMENT" Key=ManagedBy,Value=Script Key=Project,Value=KiroWorker \
        2>&1)
    
    if [ $? -eq 0 ]; then
        log_success "Parameter created successfully: $parameter_name"
        log_info "Parameter value: $parameter_value"
        
        if [ "$is_required" == "true" ]; then
            log_warning "⚠️  REQUIRED: Verify or update this parameter:"
            log_warning "   aws ssm put-parameter \\"
            log_warning "     --name $parameter_name \\"
            log_warning "     --value 'YOUR_ACTUAL_VALUE' \\"
            log_warning "     --overwrite"
        else
            log_info "ℹ️  OPTIONAL: Update this parameter if needed:"
            log_info "   aws ssm put-parameter \\"
            log_info "     --name $parameter_name \\"
            log_info "     --value 'YOUR_ACTUAL_VALUE' \\"
            log_info "     --overwrite"
        fi
    else
        log_error "Failed to create parameter: $parameter_name"
        log_error "Error: $CREATE_OUTPUT"
        return 1
    fi
    
    echo ""
}

# Step 4: Create GitHub owner parameter (REQUIRED)
log_info "Step 4: Creating GitHub owner parameter..."
echo ""

GITHUB_OWNER_PARAM="/kiro-pipeline/${ENVIRONMENT}/github-owner"
GITHUB_OWNER_DESCRIPTION="GitHub repository owner/organization for Kiro CD Pipeline in ${ENVIRONMENT} environment"
GITHUB_OWNER_VALUE="PLACEHOLDER_GITHUB_OWNER"

if ! create_or_update_parameter \
    "$GITHUB_OWNER_PARAM" \
    "$GITHUB_OWNER_DESCRIPTION" \
    "$GITHUB_OWNER_VALUE" \
    "String" \
    "true"; then
    log_error "Failed to create GitHub owner parameter"
    exit 1
fi

# Step 5: Create GitHub repo parameter (REQUIRED)
log_info "Step 5: Creating GitHub repo parameter..."
echo ""

GITHUB_REPO_PARAM="/kiro-pipeline/${ENVIRONMENT}/github-repo"
GITHUB_REPO_DESCRIPTION="GitHub repository name for Kiro CD Pipeline in ${ENVIRONMENT} environment"
GITHUB_REPO_VALUE="PLACEHOLDER_GITHUB_REPO"

if ! create_or_update_parameter \
    "$GITHUB_REPO_PARAM" \
    "$GITHUB_REPO_DESCRIPTION" \
    "$GITHUB_REPO_VALUE" \
    "String" \
    "true"; then
    log_error "Failed to create GitHub repo parameter"
    exit 1
fi

# Step 6: Create alarm threshold parameters (environment-specific)
log_info "Step 6: Creating alarm threshold parameters..."
echo ""

# Pipeline failure alarm threshold
PIPELINE_FAILURE_THRESHOLD_PARAM="/kiro-pipeline/${ENVIRONMENT}/alarm-threshold-pipeline-failures"
PIPELINE_FAILURE_THRESHOLD_DESCRIPTION="Threshold for pipeline failure alarm in ${ENVIRONMENT} environment"
case "$ENVIRONMENT" in
    test)
        PIPELINE_FAILURE_THRESHOLD_VALUE="5"
        ;;
    staging)
        PIPELINE_FAILURE_THRESHOLD_VALUE="3"
        ;;
    production)
        PIPELINE_FAILURE_THRESHOLD_VALUE="3"
        ;;
esac

if ! create_or_update_parameter \
    "$PIPELINE_FAILURE_THRESHOLD_PARAM" \
    "$PIPELINE_FAILURE_THRESHOLD_DESCRIPTION" \
    "$PIPELINE_FAILURE_THRESHOLD_VALUE" \
    "String" \
    "false"; then
    log_warning "Failed to create pipeline failure threshold parameter (optional)"
fi

# Rollback count alarm threshold
ROLLBACK_THRESHOLD_PARAM="/kiro-pipeline/${ENVIRONMENT}/alarm-threshold-rollback-count"
ROLLBACK_THRESHOLD_DESCRIPTION="Threshold for rollback count alarm in ${ENVIRONMENT} environment"
case "$ENVIRONMENT" in
    test)
        ROLLBACK_THRESHOLD_VALUE="5"
        ;;
    staging)
        ROLLBACK_THRESHOLD_VALUE="3"
        ;;
    production)
        ROLLBACK_THRESHOLD_VALUE="2"
        ;;
esac

if ! create_or_update_parameter \
    "$ROLLBACK_THRESHOLD_PARAM" \
    "$ROLLBACK_THRESHOLD_DESCRIPTION" \
    "$ROLLBACK_THRESHOLD_VALUE" \
    "String" \
    "false"; then
    log_warning "Failed to create rollback threshold parameter (optional)"
fi

# Deployment duration alarm threshold (in minutes)
DEPLOYMENT_DURATION_THRESHOLD_PARAM="/kiro-pipeline/${ENVIRONMENT}/alarm-threshold-deployment-duration"
DEPLOYMENT_DURATION_THRESHOLD_DESCRIPTION="Threshold for deployment duration alarm in ${ENVIRONMENT} environment (minutes)"
case "$ENVIRONMENT" in
    test)
        DEPLOYMENT_DURATION_THRESHOLD_VALUE="90"
        ;;
    staging)
        DEPLOYMENT_DURATION_THRESHOLD_VALUE="75"
        ;;
    production)
        DEPLOYMENT_DURATION_THRESHOLD_VALUE="60"
        ;;
esac

if ! create_or_update_parameter \
    "$DEPLOYMENT_DURATION_THRESHOLD_PARAM" \
    "$DEPLOYMENT_DURATION_THRESHOLD_DESCRIPTION" \
    "$DEPLOYMENT_DURATION_THRESHOLD_VALUE" \
    "String" \
    "false"; then
    log_warning "Failed to create deployment duration threshold parameter (optional)"
fi

# Step 7: Create timeout parameters (environment-specific)
log_info "Step 7: Creating timeout parameters..."
echo ""

# Health check duration (in minutes)
HEALTH_CHECK_DURATION_PARAM="/kiro-pipeline/${ENVIRONMENT}/health-check-duration"
HEALTH_CHECK_DURATION_DESCRIPTION="Health check monitoring duration in ${ENVIRONMENT} environment (minutes)"
case "$ENVIRONMENT" in
    test)
        HEALTH_CHECK_DURATION_VALUE="5"
        ;;
    staging)
        HEALTH_CHECK_DURATION_VALUE="5"
        ;;
    production)
        HEALTH_CHECK_DURATION_VALUE="10"
        ;;
esac

if ! create_or_update_parameter \
    "$HEALTH_CHECK_DURATION_PARAM" \
    "$HEALTH_CHECK_DURATION_DESCRIPTION" \
    "$HEALTH_CHECK_DURATION_VALUE" \
    "String" \
    "false"; then
    log_warning "Failed to create health check duration parameter (optional)"
fi

# Manual approval timeout (in hours)
APPROVAL_TIMEOUT_PARAM="/kiro-pipeline/${ENVIRONMENT}/approval-timeout"
APPROVAL_TIMEOUT_DESCRIPTION="Manual approval timeout in ${ENVIRONMENT} environment (hours)"
case "$ENVIRONMENT" in
    test)
        APPROVAL_TIMEOUT_VALUE="24"
        ;;
    staging)
        APPROVAL_TIMEOUT_VALUE="24"
        ;;
    production)
        APPROVAL_TIMEOUT_VALUE="24"
        ;;
esac

if ! create_or_update_parameter \
    "$APPROVAL_TIMEOUT_PARAM" \
    "$APPROVAL_TIMEOUT_DESCRIPTION" \
    "$APPROVAL_TIMEOUT_VALUE" \
    "String" \
    "false"; then
    log_warning "Failed to create approval timeout parameter (optional)"
fi

# Rollback timeout (in minutes)
ROLLBACK_TIMEOUT_PARAM="/kiro-pipeline/${ENVIRONMENT}/rollback-timeout"
ROLLBACK_TIMEOUT_DESCRIPTION="Rollback execution timeout in ${ENVIRONMENT} environment (minutes)"
ROLLBACK_TIMEOUT_VALUE="15"

if ! create_or_update_parameter \
    "$ROLLBACK_TIMEOUT_PARAM" \
    "$ROLLBACK_TIMEOUT_DESCRIPTION" \
    "$ROLLBACK_TIMEOUT_VALUE" \
    "String" \
    "false"; then
    log_warning "Failed to create rollback timeout parameter (optional)"
fi

# Step 8: Display summary
echo ""
echo "========================================="
echo "  Parameters Setup Summary"
echo "========================================="
echo ""
echo "Environment:       $ENVIRONMENT"
echo "AWS Account:       $AWS_ACCOUNT_ID"
echo "AWS Region:        $AWS_REGION"
echo ""
echo "Parameters Created/Verified:"
echo ""
echo "GitHub Configuration (REQUIRED):"
echo "  ✓ $GITHUB_OWNER_PARAM"
echo "  ✓ $GITHUB_REPO_PARAM"
echo ""
echo "Alarm Thresholds (OPTIONAL):"
echo "  ✓ $PIPELINE_FAILURE_THRESHOLD_PARAM = $PIPELINE_FAILURE_THRESHOLD_VALUE"
echo "  ✓ $ROLLBACK_THRESHOLD_PARAM = $ROLLBACK_THRESHOLD_VALUE"
echo "  ✓ $DEPLOYMENT_DURATION_THRESHOLD_PARAM = $DEPLOYMENT_DURATION_THRESHOLD_VALUE minutes"
echo ""
echo "Timeouts (OPTIONAL):"
echo "  ✓ $HEALTH_CHECK_DURATION_PARAM = $HEALTH_CHECK_DURATION_VALUE minutes"
echo "  ✓ $APPROVAL_TIMEOUT_PARAM = $APPROVAL_TIMEOUT_VALUE hours"
echo "  ✓ $ROLLBACK_TIMEOUT_PARAM = $ROLLBACK_TIMEOUT_VALUE minutes"
echo ""
echo "========================================="
echo "  IMPORTANT: Next Steps"
echo "========================================="
echo ""
echo "1. Update GitHub Configuration Parameters (REQUIRED):"
echo "   These parameters are required for the pipeline to access your GitHub repository."
echo ""
echo "   a. Update GitHub owner/organization:"
echo "      aws ssm put-parameter \\"
echo "        --name $GITHUB_OWNER_PARAM \\"
echo "        --value 'your-github-org' \\"
echo "        --overwrite \\"
echo "        --region $AWS_REGION"
echo ""
echo "   b. Update GitHub repository name:"
echo "      aws ssm put-parameter \\"
echo "        --name $GITHUB_REPO_PARAM \\"
echo "        --value 'your-repo-name' \\"
echo "        --overwrite \\"
echo "        --region $AWS_REGION"
echo ""
echo "2. Review and Adjust Alarm Thresholds (OPTIONAL):"
echo "   The default alarm thresholds have been set based on environment."
echo "   You can adjust them based on your requirements:"
echo ""
echo "   aws ssm put-parameter \\"
echo "     --name $PIPELINE_FAILURE_THRESHOLD_PARAM \\"
echo "     --value 'YOUR_VALUE' \\"
echo "     --overwrite \\"
echo "     --region $AWS_REGION"
echo ""
echo "3. Review and Adjust Timeouts (OPTIONAL):"
echo "   The default timeouts have been set based on environment."
echo "   You can adjust them based on your requirements:"
echo ""
echo "   aws ssm put-parameter \\"
echo "     --name $HEALTH_CHECK_DURATION_PARAM \\"
echo "     --value 'YOUR_VALUE' \\"
echo "     --overwrite \\"
echo "     --region $AWS_REGION"
echo ""
echo "4. Verify Parameters:"
echo "   You can verify the parameters are configured correctly:"
echo ""
echo "   aws ssm get-parameters-by-path \\"
echo "     --path /kiro-pipeline/${ENVIRONMENT} \\"
echo "     --region $AWS_REGION"
echo ""
echo "5. Deploy Pipeline:"
echo "   After updating the required parameters, you can deploy the pipeline:"
echo ""
echo "   ENVIRONMENT=$ENVIRONMENT ./deploy-pipeline.sh"
echo ""
log_success "Parameters setup completed!"
echo "========================================="
