# Deployment Prerequisites

This document outlines all prerequisites required before deploying the Kiro CodeBuild Worker system.

## Table of Contents

1. [AWS Requirements](#aws-requirements)
2. [Development Tools](#development-tools)
3. [GitHub Requirements](#github-requirements)
4. [Network Requirements](#network-requirements)
5. [Knowledge Requirements](#knowledge-requirements)
6. [Verification Steps](#verification-steps)

## AWS Requirements

### AWS Account

- Active AWS account with billing enabled
- Account must not be in AWS Organizations SCP restrictions that prevent required services
- Recommended: Separate AWS accounts for test, staging, and production environments

### AWS Region

- Select target AWS region (default: us-east-1)
- Ensure all required services are available in the region:
  - AWS CodeBuild
  - AWS Lambda
  - Amazon DynamoDB
  - Amazon S3
  - AWS Secrets Manager
  - AWS Systems Manager Parameter Store
  - Amazon EventBridge
  - Amazon CloudWatch
  - Amazon SNS

### AWS Credentials

Configure AWS CLI with credentials that have sufficient permissions:

```bash
aws configure
```

Provide:
- AWS Access Key ID
- AWS Secret Access Key
- Default region name (e.g., us-east-1)
- Default output format (json recommended)

**Verify credentials**:
```bash
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AIDAEXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

### IAM Permissions

Your AWS credentials must have permissions to:
- Create and manage CloudFormation stacks
- Create and manage IAM roles and policies
- Create and manage all AWS resources used by the system

See [iam-permissions.md](iam-permissions.md) for detailed permission requirements and sample policies.

### CDK Bootstrap

AWS CDK must be bootstrapped in your target account and region:

```bash
cdk bootstrap aws://<account-id>/<region>
```

Example:
```bash
cdk bootstrap aws://123456789012/us-east-1
```

**Verify bootstrap**:
```bash
aws cloudformation describe-stacks --stack-name CDKToolkit
```

If the stack exists, CDK is bootstrapped.

## Development Tools

### Node.js

**Required Version**: 18.x or later

**Installation**:

**macOS** (using Homebrew):
```bash
brew install node@18
```

**Linux** (using nvm):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows**:
Download from [nodejs.org](https://nodejs.org/)

**Verify installation**:
```bash
node --version  # Should show v18.x.x or later
npm --version   # Should show 9.x.x or later
```

### AWS CLI

**Required Version**: 2.x or later

**Installation**:

**macOS**:
```bash
brew install awscli
```

**Linux**:
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows**:
Download MSI installer from [AWS CLI website](https://aws.amazon.com/cli/)

**Verify installation**:
```bash
aws --version  # Should show aws-cli/2.x.x or later
```

### AWS CDK CLI

**Required Version**: 2.x or later

**Installation**:
```bash
npm install -g aws-cdk
```

**Verify installation**:
```bash
cdk --version  # Should show 2.x.x or later
```

### Git

**Required Version**: 2.x or later

**Installation**:

**macOS**:
```bash
brew install git
```

**Linux**:
```bash
sudo apt-get install git  # Debian/Ubuntu
sudo yum install git      # RHEL/CentOS
```

**Windows**:
Download from [git-scm.com](https://git-scm.com/)

**Verify installation**:
```bash
git --version  # Should show git version 2.x.x or later
```

### TypeScript (Optional)

While not required for deployment, TypeScript is useful for development:

```bash
npm install -g typescript
```

**Verify installation**:
```bash
tsc --version
```

## GitHub Requirements

### GitHub Account

- Active GitHub account with access to target organization/repository
- Permissions to create and manage GitHub Projects
- Permissions to create and manage Personal Access Tokens

### GitHub Personal Access Token

Create a Personal Access Token with the following scopes:

**Required Scopes**:
- `repo` - Full control of private repositories
  - `repo:status` - Access commit status
  - `repo_deployment` - Access deployment status
  - `public_repo` - Access public repositories
  - `repo:invite` - Access repository invitations
- `project` - Full control of projects
  - `read:project` - Read access to projects
  - `write:project` - Write access to projects
- `read:org` - Read organization data

**Creating a Token**:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Kiro CodeBuild Worker - Production")
4. Select required scopes listed above
5. Set expiration (recommend 90 days or less)
6. Click "Generate token"
7. **Copy the token immediately** (you won't be able to see it again)

**Security Best Practices**:
- Use separate tokens for test, staging, and production
- Set expiration dates and rotate tokens regularly
- Store tokens securely (never commit to Git)
- Revoke tokens immediately if compromised

### GitHub Project

- Existing GitHub Project (v2) in your organization/repository
- Project must have a status column for work items (e.g., "For Implementation")
- Work items must have custom fields or metadata for branch names

**Project Setup**:

1. Create or identify existing GitHub Project
2. Note the project number (visible in project URL)
3. Create or identify status column for work items ready for implementation
4. Ensure work items include branch name information

### Repository Structure

Your target repository must have:

- Feature branches with spec files in `.kiro/specs/{branch-name}/`
- Required spec files: `requirements.md`, `design.md`, `tasks.md`
- Existing pull requests for feature branches
- Buildspec.yml file (or use default)

**Example Structure**:
```
your-repo/
├── .kiro/
│   └── specs/
│       ├── feature-user-auth/
│       │   ├── requirements.md
│       │   ├── design.md
│       │   └── tasks.md
│       └── feature-api-integration/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
├── src/
├── tests/
└── buildspec.yml
```

## Network Requirements

### Internet Access

The deployment process requires internet access to:
- Download npm packages from npmjs.com
- Access AWS APIs
- Access GitHub APIs
- Download CDK assets

### AWS Service Endpoints

Ensure network access to AWS service endpoints in your region:
- `cloudformation.<region>.amazonaws.com`
- `s3.<region>.amazonaws.com`
- `dynamodb.<region>.amazonaws.com`
- `lambda.<region>.amazonaws.com`
- `codebuild.<region>.amazonaws.com`
- `secretsmanager.<region>.amazonaws.com`
- `ssm.<region>.amazonaws.com`
- `events.<region>.amazonaws.com`
- `logs.<region>.amazonaws.com`
- `sns.<region>.amazonaws.com`

### GitHub API Access

Ensure network access to:
- `api.github.com` (GitHub REST API)
- `github.com` (Git operations)

### Firewall Rules

If behind a corporate firewall, ensure outbound HTTPS (443) is allowed to:
- AWS service endpoints
- GitHub APIs
- npm registry (registry.npmjs.org)

## Knowledge Requirements

### Required Knowledge

- Basic AWS concepts (IAM, CloudFormation, S3, Lambda)
- AWS CDK fundamentals
- Command-line interface usage
- Git and GitHub workflows
- TypeScript/JavaScript basics (for customization)

### Recommended Knowledge

- AWS CodeBuild concepts
- DynamoDB basics
- CloudWatch monitoring and alarms
- Infrastructure as Code principles
- CI/CD pipeline concepts

### Learning Resources

**AWS CDK**:
- [AWS CDK Workshop](https://cdkworkshop.com/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

**AWS Services**:
- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Amazon DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)

**GitHub**:
- [GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [GitHub API Documentation](https://docs.github.com/en/rest)

## Verification Steps

Use this checklist to verify all prerequisites are met:

### AWS Verification

```bash
# Verify AWS CLI
aws --version

# Verify credentials
aws sts get-caller-identity

# Verify CDK CLI
cdk --version

# Verify CDK bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit

# Verify region services (example for us-east-1)
aws codebuild list-projects --region us-east-1
aws lambda list-functions --region us-east-1
aws dynamodb list-tables --region us-east-1
```

### Development Tools Verification

```bash
# Verify Node.js
node --version  # Should be v18.x.x or later

# Verify npm
npm --version   # Should be 9.x.x or later

# Verify Git
git --version   # Should be 2.x.x or later

# Verify TypeScript (optional)
tsc --version
```

### GitHub Verification

```bash
# Test GitHub API access with token
curl -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/user

# Expected: JSON response with your user information

# Test GitHub Projects API access
curl -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/orgs/YOUR_ORG/projects

# Expected: JSON response with projects list
```

### Network Verification

```bash
# Test AWS endpoint access
curl -I https://cloudformation.us-east-1.amazonaws.com

# Test GitHub API access
curl -I https://api.github.com

# Test npm registry access
curl -I https://registry.npmjs.org
```

## Prerequisites Checklist

Use this checklist before proceeding with deployment:

**AWS Requirements**:
- [ ] AWS account is active
- [ ] AWS CLI is installed and configured
- [ ] AWS credentials are configured
- [ ] IAM permissions are sufficient (see iam-permissions.md)
- [ ] Target AWS region is selected
- [ ] CDK is bootstrapped in target account/region

**Development Tools**:
- [ ] Node.js 18+ is installed
- [ ] npm 9+ is installed
- [ ] AWS CDK CLI 2.x is installed
- [ ] Git 2.x is installed

**GitHub Requirements**:
- [ ] GitHub account has required access
- [ ] GitHub Personal Access Token is created with required scopes
- [ ] GitHub Project exists with work items
- [ ] Repository has feature branches with spec files
- [ ] Pull requests exist for feature branches

**Network Requirements**:
- [ ] Internet access is available
- [ ] AWS service endpoints are accessible
- [ ] GitHub API is accessible
- [ ] npm registry is accessible

**Knowledge Requirements**:
- [ ] Familiar with AWS basics
- [ ] Familiar with AWS CDK
- [ ] Familiar with command-line tools
- [ ] Familiar with Git and GitHub

## Next Steps

Once all prerequisites are verified:

1. Proceed to [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions
2. Review [iam-permissions.md](iam-permissions.md) for detailed permission requirements
3. Prepare GitHub token and project configuration
4. Begin deployment process

## Troubleshooting Prerequisites

### Issue: AWS CLI not found

**Solution**:
```bash
# Reinstall AWS CLI
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### Issue: Node.js version too old

**Solution**:
```bash
# Update Node.js using nvm
nvm install 18
nvm use 18
nvm alias default 18
```

### Issue: CDK not bootstrapped

**Solution**:
```bash
# Bootstrap CDK
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1
```

### Issue: GitHub token doesn't work

**Solution**:
- Verify token has required scopes
- Check token hasn't expired
- Test token with curl command shown above
- Generate new token if needed

### Issue: Network connectivity problems

**Solution**:
- Check firewall rules
- Verify proxy settings if behind corporate proxy
- Test connectivity with curl commands shown above
- Contact network administrator if needed

## Support

For additional help with prerequisites:
- Review AWS documentation for service-specific requirements
- Check GitHub documentation for API access
- Create GitHub issue for questions
- Contact AWS support for account-related issues
