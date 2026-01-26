# Kiro CodeBuild Worker

An automated coding agent system that integrates Kiro CLI with AWS CodeBuild to perform code generation, testing, and pull request updates within CI/CD pipelines.

## Overview

The Kiro CodeBuild Worker monitors GitHub Projects for work items, processes them sequentially using distributed locking, and ensures code quality through automated testing and coverage validation. The system operates on existing feature branches that contain spec files (requirements, design, tasks), executes Kiro CLI to implement tasks, runs tests, and updates pull requests with results.

## Key Features

- **Automated Code Generation**: Executes Kiro CLI tasks from specifications
- **Quality Assurance**: Enforces 80% code coverage threshold and all tests must pass
- **Pull Request Integration**: Updates existing PRs with build results and test summaries
- **Multi-Environment Support**: Separate configurations for test, staging, and production
- **GitHub Projects Integration**: Monitors project boards for work items ready for implementation
- **Sequential Processing**: Distributed locking ensures one work item processes at a time
- **Comprehensive Monitoring**: CloudWatch alarms and SNS notifications for all infrastructure
- **Steering Synchronization**: Ensures repositories have latest coding standards from centralized Kiro Power

## Quick Start

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm installed
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- GitHub account with Projects API access
- Existing feature branches with spec files in `.kiro/specs/{branch-name}/`

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd kiro-codebuild-worker
```

2. Install dependencies:
```bash
npm install
cd infrastructure
npm install
```

3. Deploy infrastructure:
```bash
cd infrastructure
cdk bootstrap  # First time only
cdk deploy --all --context environment=test
```

4. Configure secrets (see [Deployment Guide](docs/deployment/DEPLOYMENT.md) for details):
```bash
# Populate GitHub token
aws secretsmanager put-secret-value \
  --secret-id kiro-worker-test-github-token \
  --secret-string "ghp_your_token_here"

# Populate Git credentials
aws secretsmanager put-secret-value \
  --secret-id kiro-worker-test-git-credentials \
  --secret-string '{"username":"git","password":"your_token"}'
```

5. Configure GitHub Project settings:
```bash
aws ssm put-parameter \
  --name /kiro-worker/test/github-project-config \
  --type String \
  --value '{
    "organization": "your-org",
    "repository": "your-repo",
    "projectNumber": 1,
    "targetStatusColumn": "For Implementation"
  }'
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Projects Board                      │
│  Work Items in "For Implementation" Status                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              AWS EventBridge Scheduled Rule                  │
│  (Triggers every N minutes to check for work)               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  Work Item Poller Lambda                     │
│  1. Query GitHub Projects API                                │
│  2. Validate branch and spec files exist                     │
│  3. Acquire DynamoDB lock                                    │
│  4. Trigger CodeBuild                                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     AWS CodeBuild                            │
│  1. Checkout existing feature branch                         │
│  2. Synchronize steering files                               │
│  3. Execute Kiro CLI tasks                                   │
│  4. Run tests and validate coverage ≥80%                     │
│  5. Update existing pull request                             │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Creating Work Items

1. Create a feature branch with spec files:
```bash
git checkout -b feature/my-feature
mkdir -p .kiro/specs/feature-my-feature
# Create requirements.md, design.md, tasks.md
git add .kiro/specs/
git commit -m "feat: add spec for my feature"
git push origin feature/my-feature
```

2. Create a pull request for the branch

3. Add work item to GitHub Project in "For Implementation" status column

4. The system will automatically:
   - Detect the work item on next polling cycle
   - Validate branch, spec files, and PR exist
   - Acquire lock and trigger CodeBuild
   - Execute Kiro CLI tasks
   - Run tests and validate coverage
   - Update PR with results

### Monitoring Builds

View build status in AWS Console:
- **CodeBuild**: https://console.aws.amazon.com/codebuild
- **CloudWatch Logs**: https://console.aws.amazon.com/cloudwatch/logs
- **Lambda Functions**: https://console.aws.amazon.com/lambda

Or use AWS CLI:
```bash
# List recent builds
aws codebuild list-builds-for-project \
  --project-name kiro-worker-test

# Get build details
aws codebuild batch-get-builds \
  --ids <build-id>

# View logs
aws logs tail /aws/codebuild/kiro-worker-test --follow
```

## Configuration

### Environment Variables

CodeBuild environment variables (set automatically by poller):
- `ENVIRONMENT`: test | staging | production
- `BRANCH_NAME`: Feature branch to work on
- `SPEC_PATH`: Path to spec folder (`.kiro/specs/{branch-name}`)
- `COVERAGE_THRESHOLD`: Minimum coverage percentage (default: 80)

### Polling Interval

Configure EventBridge schedule in `infrastructure/lib/config/environments.ts`:
```typescript
pollingInterval: 'rate(5 minutes)'  // Check every 5 minutes
```

### Coverage Threshold

Adjust in environment configuration or buildspec.yml:
```yaml
env:
  variables:
    COVERAGE_THRESHOLD: "80"
```

## Documentation

- **[Deployment Guide](docs/deployment/DEPLOYMENT.md)**: Detailed deployment instructions
- **[Prerequisites](docs/deployment/prerequisites.md)**: Required tools and setup
- **[IAM Permissions](docs/deployment/iam-permissions.md)**: Required AWS permissions
- **[Troubleshooting](docs/deployment/troubleshooting.md)**: Common issues and solutions
- **[Architecture](docs/architecture/)**: System design and component details

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Infrastructure tests
cd infrastructure
npm test
```

### Building

```bash
# Build application
npm run build

# Build infrastructure
cd infrastructure
npm run build
```

### Linting

```bash
npm run lint
```

## Project Structure

```
kiro-codebuild-worker/
├── src/                          # Application source code
│   ├── components/               # Core components
│   ├── types/                    # TypeScript type definitions
│   ├── errors/                   # Custom error classes
│   ├── utils/                    # Utility functions
│   ├── lambda/                   # Lambda function handlers
│   └── index.ts                  # Main entry point
├── infrastructure/               # AWS CDK infrastructure code
│   ├── bin/                      # CDK app entry point
│   ├── lib/                      # CDK stacks and constructs
│   └── test/                     # Infrastructure tests
├── docs/                         # Documentation
│   ├── deployment/               # Deployment guides
│   └── architecture/             # Architecture documentation
├── .kiro/                        # Kiro configuration
│   ├── specs/                    # Feature specifications
│   └── steering/                 # Coding standards
├── buildspec.yml                 # CodeBuild build specification
└── README.md                     # This file
```

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Testing**: Vitest with 80% coverage requirement
- **Infrastructure**: AWS CDK
- **AWS Services**: CodeBuild, Lambda, DynamoDB, S3, Secrets Manager, EventBridge, CloudWatch, SNS

## Contributing

1. Read all steering documentation in `.kiro/steering/`
2. Follow TypeScript standards
3. Follow testing standards (≥80% coverage, all tests pass)
4. Follow Git workflow (conventional commits, PR process)
5. Update documentation as needed

## Support

- **Issues**: Create GitHub Issue
- **Discussions**: Start GitHub Discussion
- **Documentation**: See `docs/` directory

## License

See LICENSE file for details.

## Security

- All credentials stored in AWS Secrets Manager
- IAM role-based authentication
- Secrets sanitized from logs
- Least-privilege permissions
- Encryption at rest and in transit

## Monitoring

The system includes comprehensive monitoring:
- Build success/failure rates
- Build duration metrics
- Test failure rates
- Coverage percentages
- Lambda invocation metrics
- DynamoDB lock metrics

CloudWatch alarms trigger SNS notifications when thresholds are breached.

## Roadmap

- [ ] Support for GitLab Projects
- [ ] Parallel work item processing (configurable)
- [ ] Advanced retry strategies
- [ ] Custom notification channels (Slack, Teams)
- [ ] Enhanced metrics and dashboards

## Acknowledgments

Built with Kiro CLI and AWS CDK.
