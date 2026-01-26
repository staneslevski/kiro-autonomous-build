#!/bin/bash

# Kiro CodeBuild Worker - Deployment Script
# This script automates the deployment of all CDK stacks with proper dependency handling

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="test"
DRY_RUN=false
ROLLBACK=false
STACK=""
SKIP_VALIDATION=false

# Stack deployment order
STACKS=(
  "KiroWorkerCore"
  "KiroWorkerSecrets"
  "KiroWorkerPoller"
  "KiroWorkerCodeBuild"
  "KiroWorkerMonitoring"
)

# Function to print colored output
print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Function to print usage
usage() {
  cat << EOF
Usage: $0 [OPTIONS]

Deploy Kiro CodeBuild Worker infrastructure to AWS

OPTIONS:
  -e, --environment ENV    Target environment (test|staging|production) [default: test]
  -s, --stack STACK        Deploy specific stack only
  -d, --dry-run            Validate without deploying (cdk synth only)
  -r, --rollback           Rollback (destroy) stacks in reverse order
  --skip-validation        Skip prerequisite validation
  -h, --help               Show this help message

EXAMPLES:
  # Deploy all stacks to test environment
  $0 --environment test

  # Deploy specific stack
  $0 --environment test --stack KiroWorkerCore

  # Dry run (validation only)
  $0 --environment test --dry-run

  # Rollback all stacks
  $0 --environment test --rollback

EOF
  exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -e|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -s|--stack)
      STACK="$2"
      shift 2
      ;;
    -d|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -r|--rollback)
      ROLLBACK=true
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      print_error "Unknown option: $1"
      usage
      ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(test|staging|production)$ ]]; then
  print_error "Invalid environment: $ENVIRONMENT"
  print_info "Valid environments: test, staging, production"
  exit 1
fi

print_info "Kiro CodeBuild Worker Deployment"
print_info "Environment: $ENVIRONMENT"
print_info "Dry Run: $DRY_RUN"
print_info "Rollback: $ROLLBACK"
echo ""

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to validate prerequisites
validate_prerequisites() {
  if [ "$SKIP_VALIDATION" = true ]; then
    print_warning "Skipping prerequisite validation"
    return 0
  fi

  print_info "Validating prerequisites..."

  # Check Node.js
  if ! command_exists node; then
    print_error "Node.js is not installed"
    print_info "Install Node.js 18+ from https://nodejs.org/"
    exit 1
  fi

  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version must be 18 or higher (found: $(node --version))"
    exit 1
  fi
  print_success "Node.js $(node --version) found"

  # Check npm
  if ! command_exists npm; then
    print_error "npm is not installed"
    exit 1
  fi
  print_success "npm $(npm --version) found"

  # Check AWS CLI
  if ! command_exists aws; then
    print_error "AWS CLI is not installed"
    print_info "Install AWS CLI from https://aws.amazon.com/cli/"
    exit 1
  fi
  print_success "AWS CLI $(aws --version | cut -d' ' -f1 | cut -d'/' -f2) found"

  # Check AWS credentials
  if ! aws sts get-caller-identity >/dev/null 2>&1; then
    print_error "AWS credentials are not configured or invalid"
    print_info "Run 'aws configure' to set up credentials"
    exit 1
  fi
  CALLER_IDENTITY=$(aws sts get-caller-identity --query 'Arn' --output text)
  print_success "AWS credentials configured: $CALLER_IDENTITY"

  # Check CDK CLI
  if ! command_exists cdk; then
    print_error "AWS CDK CLI is not installed"
    print_info "Install with: npm install -g aws-cdk"
    exit 1
  fi
  print_success "AWS CDK $(cdk --version) found"

  # Check if CDK is bootstrapped
  ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
  REGION=$(aws configure get region || echo "us-east-1")
  
  if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$REGION" >/dev/null 2>&1; then
    print_warning "CDK is not bootstrapped in account $ACCOUNT_ID region $REGION"
    print_info "Run: cdk bootstrap aws://$ACCOUNT_ID/$REGION"
    
    read -p "Would you like to bootstrap now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      print_info "Bootstrapping CDK..."
      cdk bootstrap "aws://$ACCOUNT_ID/$REGION"
      print_success "CDK bootstrapped successfully"
    else
      print_error "CDK bootstrap is required for deployment"
      exit 1
    fi
  else
    print_success "CDK is bootstrapped"
  fi

  echo ""
}

# Function to install dependencies
install_dependencies() {
  print_info "Installing dependencies..."
  
  if [ ! -d "node_modules" ]; then
    npm install
    print_success "Dependencies installed"
  else
    print_success "Dependencies already installed"
  fi
  
  echo ""
}

# Function to build project
build_project() {
  print_info "Building project..."
  npm run build
  print_success "Project built successfully"
  echo ""
}

# Function to synthesize CDK stacks
synthesize_stacks() {
  print_info "Synthesizing CloudFormation templates..."
  cdk synth --context environment="$ENVIRONMENT" --quiet
  print_success "CloudFormation templates synthesized"
  echo ""
}

# Function to deploy a single stack
deploy_stack() {
  local stack_name=$1
  
  print_info "Deploying stack: $stack_name"
  
  if cdk deploy "$stack_name" \
    --context environment="$ENVIRONMENT" \
    --require-approval never \
    --progress events; then
    print_success "Stack $stack_name deployed successfully"
    return 0
  else
    print_error "Failed to deploy stack $stack_name"
    return 1
  fi
}

# Function to destroy a single stack
destroy_stack() {
  local stack_name=$1
  
  print_info "Destroying stack: $stack_name"
  
  if cdk destroy "$stack_name" \
    --context environment="$ENVIRONMENT" \
    --force; then
    print_success "Stack $stack_name destroyed successfully"
    return 0
  else
    print_error "Failed to destroy stack $stack_name"
    return 1
  fi
}

# Function to deploy all stacks
deploy_all_stacks() {
  print_info "Deploying all stacks in dependency order..."
  echo ""
  
  local failed_stacks=()
  
  for stack in "${STACKS[@]}"; do
    if ! deploy_stack "$stack"; then
      failed_stacks+=("$stack")
      print_error "Deployment failed at stack: $stack"
      print_info "Successfully deployed stacks: ${STACKS[@]:0:$((${#STACKS[@]} - ${#failed_stacks[@]}))}"
      print_info "Failed stacks: ${failed_stacks[@]}"
      exit 1
    fi
    echo ""
  done
  
  print_success "All stacks deployed successfully!"
}

# Function to rollback all stacks
rollback_all_stacks() {
  print_warning "Rolling back all stacks in reverse order..."
  echo ""
  
  # Reverse the stack order for rollback
  local reversed_stacks=()
  for ((i=${#STACKS[@]}-1; i>=0; i--)); do
    reversed_stacks+=("${STACKS[$i]}")
  done
  
  for stack in "${reversed_stacks[@]}"; do
    destroy_stack "$stack" || true  # Continue even if destroy fails
    echo ""
  done
  
  print_success "Rollback complete"
}

# Function to get stack outputs
get_stack_outputs() {
  print_info "Retrieving stack outputs..."
  echo ""
  
  for stack in "${STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; then
      print_info "Outputs for $stack:"
      aws cloudformation describe-stacks \
        --stack-name "$stack" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table || true
      echo ""
    fi
  done
}

# Function to generate deployment report
generate_deployment_report() {
  local report_file="deployment-report-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).txt"
  
  print_info "Generating deployment report: $report_file"
  
  {
    echo "Kiro CodeBuild Worker Deployment Report"
    echo "========================================"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Timestamp: $(date)"
    echo "Deployed by: $(aws sts get-caller-identity --query 'Arn' --output text)"
    echo ""
    echo "Deployed Stacks:"
    echo "----------------"
    
    for stack in "${STACKS[@]}"; do
      if aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; then
        echo "✓ $stack"
      else
        echo "✗ $stack (not deployed)"
      fi
    done
    
    echo ""
    echo "Stack Outputs:"
    echo "--------------"
    
    for stack in "${STACKS[@]}"; do
      if aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; then
        echo ""
        echo "$stack:"
        aws cloudformation describe-stacks \
          --stack-name "$stack" \
          --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
          --output text | sed 's/^/  /'
      fi
    done
    
    echo ""
    echo "Next Steps:"
    echo "-----------"
    echo "1. Populate GitHub token in Secrets Manager"
    echo "2. Populate Git credentials in Secrets Manager"
    echo "3. Configure GitHub Project settings in Parameter Store"
    echo "4. Subscribe to SNS topics for alerts"
    echo "5. Test Lambda function invocation"
    echo ""
    echo "See docs/deployment/DEPLOYMENT.md for detailed instructions"
    
  } > "$report_file"
  
  print_success "Deployment report saved to: $report_file"
}

# Main execution
main() {
  # Validate prerequisites
  validate_prerequisites
  
  # Install dependencies
  install_dependencies
  
  # Build project
  build_project
  
  # Synthesize stacks
  synthesize_stacks
  
  # Handle dry run
  if [ "$DRY_RUN" = true ]; then
    print_success "Dry run complete - no resources were deployed"
    print_info "CloudFormation templates are in cdk.out/"
    exit 0
  fi
  
  # Handle rollback
  if [ "$ROLLBACK" = true ]; then
    read -p "Are you sure you want to rollback all stacks? This will delete resources. (yes/no) " -r
    echo
    if [[ $REPLY == "yes" ]]; then
      rollback_all_stacks
    else
      print_info "Rollback cancelled"
    fi
    exit 0
  fi
  
  # Deploy stacks
  if [ -n "$STACK" ]; then
    # Deploy specific stack
    deploy_stack "$STACK"
  else
    # Deploy all stacks
    deploy_all_stacks
  fi
  
  echo ""
  print_success "Deployment complete!"
  echo ""
  
  # Get stack outputs
  get_stack_outputs
  
  # Generate deployment report
  generate_deployment_report
  
  echo ""
  print_info "Next steps:"
  print_info "1. Review deployment report"
  print_info "2. Configure secrets and parameters"
  print_info "3. See docs/deployment/DEPLOYMENT.md for post-deployment steps"
}

# Run main function
main
