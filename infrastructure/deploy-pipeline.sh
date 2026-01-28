#!/bin/bash

# CD Pipeline Deployment Script
# Deploys the Kiro CodeBuild Worker CD Pipeline infrastructure to AWS
# Usage: ENVIRONMENT=test ./deploy-pipeline.sh

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
echo "  Kiro CD Pipeline Deployment Script"
echo "========================================="
echo ""

# Step 1: Validate environment variable
log_info "Step 1: Validating environment..."

if [ -z "${ENVIRONMENT:-}" ]; then
    log_error "ENVIRONMENT variable is not set"
    log_error "Usage: ENVIRONMENT=test ./deploy-pipeline.sh"
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

# Step 3: Check CDK CLI is installed
log_info "Step 3: Checking AWS CDK CLI..."

if ! command -v cdk &> /dev/null; then
    log_error "AWS CDK CLI is not installed"
    log_error "Please install CDK: npm install -g aws-cdk"
    exit 1
fi

CDK_VERSION=$(cdk --version | awk '{print $1}')
log_success "AWS CDK CLI is installed (version: $CDK_VERSION)"

# Step 4: Get AWS account and region
log_info "Step 4: Getting AWS account information..."

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")

if [ -z "$AWS_ACCOUNT_ID" ]; then
    log_error "Failed to get AWS account ID"
    log_error "Please configure AWS credentials: aws configure"
    exit 1
fi

log_success "AWS Account ID: $AWS_ACCOUNT_ID"
log_success "AWS Region: $AWS_REGION"

# Step 5: Check CDK bootstrap
log_info "Step 5: Checking CDK bootstrap status..."

BOOTSTRAP_STACK_NAME="CDKToolkit"
BOOTSTRAP_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "$BOOTSTRAP_STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$BOOTSTRAP_EXISTS" == "NOT_FOUND" ]; then
    log_warning "CDK bootstrap stack not found"
    log_info "Bootstrapping CDK for account $AWS_ACCOUNT_ID in region $AWS_REGION..."
    
    if cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION; then
        log_success "CDK bootstrap completed successfully"
    else
        log_error "CDK bootstrap failed"
        exit 1
    fi
else
    log_success "CDK is already bootstrapped (Status: $BOOTSTRAP_EXISTS)"
fi

# Step 6: Install dependencies
log_info "Step 6: Installing dependencies..."

if [ ! -d "node_modules" ]; then
    log_info "Running npm install..."
    npm install
    log_success "Dependencies installed"
else
    log_success "Dependencies already installed"
fi

# Step 7: Build TypeScript code
log_info "Step 7: Building TypeScript code..."

if npm run build; then
    log_success "TypeScript build completed"
else
    log_error "TypeScript build failed"
    exit 1
fi

# Step 8: Synthesize CDK stacks
log_info "Step 8: Synthesizing CDK stacks..."

if cdk synth --all --context environment=$ENVIRONMENT > /dev/null; then
    log_success "CDK synthesis completed"
else
    log_error "CDK synthesis failed"
    exit 1
fi

# Step 9: Deploy stacks sequentially
log_info "Step 9: Deploying stacks sequentially..."
echo ""

# Define stack names
CORE_STACK="kiro-pipeline-${ENVIRONMENT}-core"
PIPELINE_STACK="kiro-pipeline-${ENVIRONMENT}"
MONITORING_STACK="kiro-worker-${ENVIRONMENT}-monitoring"

# Function to deploy a stack
deploy_stack() {
    local stack_name=$1
    local stack_description=$2
    
    log_info "Deploying $stack_description ($stack_name)..."
    
    if cdk deploy "$stack_name" \
        --context environment=$ENVIRONMENT \
        --require-approval never \
        --progress events \
        --outputs-file "cdk-outputs-${stack_name}.json"; then
        log_success "$stack_description deployed successfully"
        return 0
    else
        log_error "$stack_description deployment failed"
        return 1
    fi
}

# Deploy Core Infrastructure Stack
if ! deploy_stack "$CORE_STACK" "Core Infrastructure Stack"; then
    log_error "Deployment failed at Core Infrastructure Stack"
    log_error "Rollback instructions:"
    log_error "  1. Review CloudFormation console for error details"
    log_error "  2. Fix the issue in the code"
    log_error "  3. Run: cdk destroy $CORE_STACK --context environment=$ENVIRONMENT"
    log_error "  4. Re-run this deployment script"
    exit 1
fi

echo ""

# Deploy Pipeline Stack
if ! deploy_stack "$PIPELINE_STACK" "Pipeline Stack"; then
    log_error "Deployment failed at Pipeline Stack"
    log_error "Rollback instructions:"
    log_error "  1. Review CloudFormation console for error details"
    log_error "  2. Fix the issue in the code"
    log_error "  3. Run: cdk destroy $PIPELINE_STACK --context environment=$ENVIRONMENT"
    log_error "  4. Core stack is still deployed and can be reused"
    log_error "  5. Re-run this deployment script"
    exit 1
fi

echo ""

# Deploy Monitoring Stack (extends existing monitoring stack)
if ! deploy_stack "$MONITORING_STACK" "Monitoring Stack"; then
    log_error "Deployment failed at Monitoring Stack"
    log_error "Rollback instructions:"
    log_error "  1. Review CloudFormation console for error details"
    log_error "  2. Fix the issue in the code"
    log_error "  3. Run: cdk destroy $MONITORING_STACK --context environment=$ENVIRONMENT"
    log_error "  4. Core and Pipeline stacks are still deployed"
    log_error "  5. Re-run this deployment script"
    exit 1
fi

echo ""
log_success "All stacks deployed successfully!"

# Step 10: Post-deployment validation
log_info "Step 10: Running post-deployment validation..."
echo ""

VALIDATION_SCRIPT="./validate-deployment.sh"

if [ -f "$VALIDATION_SCRIPT" ]; then
    if bash "$VALIDATION_SCRIPT"; then
        log_success "Post-deployment validation passed"
    else
        log_warning "Post-deployment validation failed"
        log_warning "Please review the validation output above"
        log_warning "The deployment completed, but some resources may need manual verification"
        exit 1
    fi
else
    log_warning "Validation script not found: $VALIDATION_SCRIPT"
    log_warning "Skipping post-deployment validation"
    log_warning "Please manually verify the deployment"
fi

# Step 11: Display deployment summary
echo ""
echo "========================================="
echo "  Deployment Summary"
echo "========================================="
echo ""
echo "Environment:       $ENVIRONMENT"
echo "AWS Account:       $AWS_ACCOUNT_ID"
echo "AWS Region:        $AWS_REGION"
echo ""
echo "Deployed Stacks:"
echo "  ✓ $CORE_STACK"
echo "  ✓ $PIPELINE_STACK"
echo "  ✓ $MONITORING_STACK"
echo ""
echo "Stack Outputs:"
if [ -f "cdk-outputs-${CORE_STACK}.json" ]; then
    echo "  Core Stack outputs saved to: cdk-outputs-${CORE_STACK}.json"
fi
if [ -f "cdk-outputs-${PIPELINE_STACK}.json" ]; then
    echo "  Pipeline Stack outputs saved to: cdk-outputs-${PIPELINE_STACK}.json"
fi
if [ -f "cdk-outputs-${MONITORING_STACK}.json" ]; then
    echo "  Monitoring Stack outputs saved to: cdk-outputs-${MONITORING_STACK}.json"
fi
echo ""
echo "Next Steps:"
echo "  1. Configure GitHub token secret:"
echo "     aws secretsmanager put-secret-value \\"
echo "       --secret-id kiro-pipeline-${ENVIRONMENT}-github-token \\"
echo "       --secret-string 'your-github-token'"
echo ""
echo "  2. Verify pipeline in AWS Console:"
echo "     https://console.aws.amazon.com/codesuite/codepipeline/pipelines/kiro-pipeline-${ENVIRONMENT}/view"
echo ""
echo "  3. View CloudWatch dashboard:"
echo "     https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards:name=kiro-worker-${ENVIRONMENT}"
echo ""
log_success "Deployment completed successfully!"
echo "========================================="
