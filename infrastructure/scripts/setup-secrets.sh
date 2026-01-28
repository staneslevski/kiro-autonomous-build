#!/bin/bash

# CD Pipeline Secrets Setup Script
# Creates placeholder secrets in AWS Secrets Manager for the CD Pipeline
# Usage: ENVIRONMENT=test ./scripts/setup-secrets.sh

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
echo "  CD Pipeline Secrets Setup Script"
echo "========================================="
echo ""

# Step 1: Validate environment variable
log_info "Step 1: Validating environment..."

if [ -z "${ENVIRONMENT:-}" ]; then
    log_error "ENVIRONMENT variable is not set"
    log_error "Usage: ENVIRONMENT=test ./scripts/setup-secrets.sh"
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

# Function to create or update a secret
create_or_update_secret() {
    local secret_name=$1
    local secret_description=$2
    local placeholder_value=$3
    local is_optional=$4
    
    log_info "Processing secret: $secret_name..."
    
    # Check if secret already exists
    SECRET_EXISTS=$(aws secretsmanager describe-secret \
        --secret-id "$secret_name" \
        --region "$AWS_REGION" \
        --query 'Name' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$SECRET_EXISTS" != "NOT_FOUND" ]; then
        log_warning "Secret already exists: $secret_name"
        
        # Get the secret ARN
        SECRET_ARN=$(aws secretsmanager describe-secret \
            --secret-id "$secret_name" \
            --region "$AWS_REGION" \
            --query 'ARN' \
            --output text 2>/dev/null)
        
        log_info "Existing secret ARN: $SECRET_ARN"
        
        # Check if it has a value
        HAS_VALUE=$(aws secretsmanager get-secret-value \
            --secret-id "$secret_name" \
            --region "$AWS_REGION" \
            --query 'SecretString' \
            --output text 2>/dev/null || echo "")
        
        if [ -n "$HAS_VALUE" ] && [ "$HAS_VALUE" != "$placeholder_value" ]; then
            log_success "Secret has a configured value (not placeholder)"
        else
            log_warning "Secret exists but may still have placeholder value"
            log_warning "Please update with actual value if needed"
        fi
        
        return 0
    fi
    
    # Create new secret with placeholder value
    log_info "Creating new secret: $secret_name..."
    
    CREATE_OUTPUT=$(aws secretsmanager create-secret \
        --name "$secret_name" \
        --description "$secret_description" \
        --secret-string "$placeholder_value" \
        --region "$AWS_REGION" \
        --tags Key=Environment,Value="$ENVIRONMENT" Key=ManagedBy,Value=Script Key=Project,Value=KiroWorker \
        2>&1)
    
    if [ $? -eq 0 ]; then
        SECRET_ARN=$(echo "$CREATE_OUTPUT" | grep -o 'arn:aws:secretsmanager:[^"]*')
        log_success "Secret created successfully: $secret_name"
        log_info "Secret ARN: $SECRET_ARN"
        
        if [ "$is_optional" == "false" ]; then
            log_warning "⚠️  REQUIRED: Update this secret with actual value:"
            log_warning "   aws secretsmanager put-secret-value \\"
            log_warning "     --secret-id $secret_name \\"
            log_warning "     --secret-string 'YOUR_ACTUAL_VALUE'"
        else
            log_info "ℹ️  OPTIONAL: Update this secret if needed:"
            log_info "   aws secretsmanager put-secret-value \\"
            log_info "     --secret-id $secret_name \\"
            log_info "     --secret-string 'YOUR_ACTUAL_VALUE'"
        fi
    else
        log_error "Failed to create secret: $secret_name"
        log_error "Error: $CREATE_OUTPUT"
        return 1
    fi
    
    echo ""
}

# Step 4: Create GitHub token secret (REQUIRED)
log_info "Step 4: Creating GitHub token secret..."
echo ""

GITHUB_TOKEN_SECRET="kiro-pipeline-${ENVIRONMENT}-github-token"
GITHUB_TOKEN_DESCRIPTION="GitHub OAuth token for Kiro CD Pipeline in ${ENVIRONMENT} environment"
GITHUB_TOKEN_PLACEHOLDER="PLACEHOLDER_GITHUB_TOKEN_REPLACE_ME"

if ! create_or_update_secret \
    "$GITHUB_TOKEN_SECRET" \
    "$GITHUB_TOKEN_DESCRIPTION" \
    "$GITHUB_TOKEN_PLACEHOLDER" \
    "false"; then
    log_error "Failed to create GitHub token secret"
    exit 1
fi

# Step 5: Create Slack webhook secret (OPTIONAL)
log_info "Step 5: Creating Slack webhook secret (optional)..."
echo ""

SLACK_WEBHOOK_SECRET="kiro-pipeline-${ENVIRONMENT}-slack-webhook"
SLACK_WEBHOOK_DESCRIPTION="Slack webhook URL for Kiro CD Pipeline notifications in ${ENVIRONMENT} environment"
SLACK_WEBHOOK_PLACEHOLDER="PLACEHOLDER_SLACK_WEBHOOK_REPLACE_ME"

if ! create_or_update_secret \
    "$SLACK_WEBHOOK_SECRET" \
    "$SLACK_WEBHOOK_DESCRIPTION" \
    "$SLACK_WEBHOOK_PLACEHOLDER" \
    "true"; then
    log_warning "Failed to create Slack webhook secret (optional)"
    log_warning "You can create this manually later if needed"
fi

# Step 6: Display summary
echo ""
echo "========================================="
echo "  Secrets Setup Summary"
echo "========================================="
echo ""
echo "Environment:       $ENVIRONMENT"
echo "AWS Account:       $AWS_ACCOUNT_ID"
echo "AWS Region:        $AWS_REGION"
echo ""
echo "Secrets Created/Verified:"
echo "  ✓ $GITHUB_TOKEN_SECRET (REQUIRED)"
echo "  ✓ $SLACK_WEBHOOK_SECRET (OPTIONAL)"
echo ""
echo "========================================="
echo "  IMPORTANT: Next Steps"
echo "========================================="
echo ""
echo "1. Update GitHub Token Secret (REQUIRED):"
echo "   This secret is required for the pipeline to access GitHub."
echo ""
echo "   a. Create a GitHub Personal Access Token:"
echo "      - Go to: https://github.com/settings/tokens"
echo "      - Click 'Generate new token (classic)'"
echo "      - Select scopes: repo, admin:repo_hook"
echo "      - Copy the generated token"
echo ""
echo "   b. Update the secret with your token:"
echo "      aws secretsmanager put-secret-value \\"
echo "        --secret-id $GITHUB_TOKEN_SECRET \\"
echo "        --secret-string 'ghp_your_actual_github_token' \\"
echo "        --region $AWS_REGION"
echo ""
echo "2. Update Slack Webhook Secret (OPTIONAL):"
echo "   This secret is optional for Slack notifications."
echo ""
echo "   a. Create a Slack Incoming Webhook:"
echo "      - Go to: https://api.slack.com/messaging/webhooks"
echo "      - Create a new webhook for your workspace"
echo "      - Copy the webhook URL"
echo ""
echo "   b. Update the secret with your webhook URL:"
echo "      aws secretsmanager put-secret-value \\"
echo "        --secret-id $SLACK_WEBHOOK_SECRET \\"
echo "        --secret-string 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL' \\"
echo "        --region $AWS_REGION"
echo ""
echo "3. Verify Secrets:"
echo "   You can verify the secrets are configured correctly:"
echo ""
echo "   aws secretsmanager list-secrets \\"
echo "     --region $AWS_REGION \\"
echo "     --filters Key=name,Values=kiro-pipeline-${ENVIRONMENT}"
echo ""
echo "4. Deploy Pipeline:"
echo "   After updating the GitHub token secret, you can deploy the pipeline:"
echo ""
echo "   ENVIRONMENT=$ENVIRONMENT ./deploy-pipeline.sh"
echo ""
log_success "Secrets setup completed!"
echo "========================================="

