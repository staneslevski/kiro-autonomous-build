# Kiro CodeBuild Worker - Project Overview

## Project Description

The Kiro CodeBuild Worker is an automated coding agent system that integrates Kiro CLI with AWS CodeBuild to perform code generation, testing, and pull request updates within CI/CD pipelines. The system monitors GitHub Projects for work items, processes them sequentially using distributed locking, and ensures code quality through automated testing and coverage validation.

## Technology Stack

### Core Application
- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Package Manager**: npm

### Key Libraries
- **AWS SDK**: @aws-sdk/client-* (v3) - Modular AWS service clients
- **Git Operations**: simple-git - Git operations in Node.js
- **GitHub API**: @octokit/rest - GitHub REST API client
- **Testing**: Vitest - Fast unit test framework
- **Coverage**: @vitest/coverage-v8 - Code coverage reporting
- **Property Testing**: fast-check - Property-based testing
- **Mocking**: aws-sdk-client-mock - AWS SDK mocking

### Infrastructure
- **IaC Framework**: AWS CDK (TypeScript)
- **Cloud Provider**: AWS
- **Services**: CodeBuild, Lambda, DynamoDB, S3, Secrets Manager, EventBridge, CloudWatch, SNS

## Project Structure

```
kiro-codebuild-worker/
├── src/                          # Application source code
│   ├── components/               # Core components
│   │   ├── git-branch-manager.ts
│   │   ├── steering-synchronizer.ts
│   │   ├── kiro-cli-executor.ts
│   │   ├── test-runner.ts
│   │   ├── pull-request-updater.ts
│   │   ├── github-project-monitor.ts
│   │   ├── work-item-poller.ts
│   │   └── work-item-state-manager.ts
│   ├── types/                    # TypeScript type definitions
│   ├── errors/                   # Custom error classes
│   ├── utils/                    # Utility functions
│   ├── lambda/                   # Lambda function handlers
│   └── index.ts                  # Main entry point
├── infrastructure/               # AWS CDK infrastructure code
│   ├── bin/                      # CDK app entry point
│   ├── lib/                      # CDK stacks and constructs
│   │   ├── stacks/
│   │   ├── constructs/
│   │   └── config/
│   └── test/                     # Infrastructure tests
├── tests/                        # Application tests
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/                         # Documentation
│   ├── deployment/
│   └── architecture/
├── .kiro/                        # Kiro configuration
│   ├── specs/                    # Feature specifications
│   └── steering/                 # Coding standards
├── buildspec.yml                 # CodeBuild build specification
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Architecture Overview

### System Flow

1. **EventBridge Scheduled Rule** triggers Work Item Poller Lambda every N minutes
2. **Work Item Poller Lambda** queries GitHub Projects API for work items in "For Implementation" status
3. **DynamoDB Lock** ensures only one work item processes at a time
4. **CodeBuild Project** is triggered with work item details (branch name, spec path)
5. **Kiro Worker** executes in CodeBuild:
   - Checkout existing feature branch
   - Validate spec files and pull request exist
   - Synchronize steering files from Kiro Power
   - Execute Kiro CLI with spec tasks
   - Run tests and validate coverage ≥80%
   - Update existing pull request with results
6. **CloudWatch Alarms** monitor metrics and send notifications via SNS

### Key Components

**Git Branch Manager**: Handles Git operations (checkout, commit, push) and validates branch/spec/PR existence

**Steering Synchronizer**: Ensures repository has latest coding standards from centralized Kiro Power

**Kiro CLI Executor**: Executes Kiro CLI commands and captures output

**Test Runner**: Runs test suites and validates code coverage meets 80% threshold

**Pull Request Updater**: Updates existing PRs with build results and test summaries

**GitHub Project Monitor**: Queries GitHub Projects API for work items

**Work Item Poller**: Lambda function that polls for work and triggers CodeBuild

**Work Item State Manager**: Manages DynamoDB-based distributed locking for concurrency control

## Development Workflow

### Setup

```bash
# Clone repository
git clone <repository-url>
cd kiro-codebuild-worker

# Install dependencies
npm install

# Run tests
npm test

# Check coverage
npm run test:coverage

# Build
npm run build
```

### Development Cycle

1. Create feature branch: `git checkout -b feature/123-description`
2. Write code following TypeScript standards
3. Write tests (maintain ≥80% coverage)
4. Run tests: `npm test`
5. Commit with conventional commits: `git commit -m "feat: add feature"`
6. Push and create PR
7. Ensure CI passes (all tests, coverage, linting)
8. Get code review approval
9. Merge to main

### Testing Requirements

**CRITICAL**: All tests MUST pass and coverage MUST be ≥80% before completing any task.

- Run tests: `npm test`
- Run with coverage: `npm run test:coverage`
- Watch mode: `npm run test:watch`
- UI mode: `npm run test:ui`

**Never**:
- Skip tests (`.skip()`)
- Comment out failing tests
- Disable test execution
- Mark tasks complete with failing tests

## Deployment

### Prerequisites

- AWS CLI configured
- AWS account with appropriate permissions
- Node.js 18+ installed
- npm installed

### Deploy Infrastructure

```bash
cd infrastructure

# Install CDK dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy to test environment
cdk deploy --all --context environment=test

# Deploy to production
cdk deploy --all --context environment=production
```

### Deploy Application

Application code is deployed via CodeBuild when infrastructure triggers builds.

## Configuration

### Environment Variables

**CodeBuild Environment**:
- `ENVIRONMENT`: test | staging | production
- `BRANCH_NAME`: Feature branch to work on
- `SPEC_PATH`: Path to spec folder
- `COVERAGE_THRESHOLD`: Minimum coverage percentage (80)

**Lambda Environment**:
- `LOCKS_TABLE_NAME`: DynamoDB table for locking
- `GITHUB_TOKEN_SECRET_ARN`: Secrets Manager ARN for GitHub token

### AWS Secrets

Store in AWS Secrets Manager:
- `/kiro-worker/{env}/github-token`: GitHub API token
- `/kiro-worker/{env}/git-credentials`: Git repository credentials

### AWS Parameters

Store in Systems Manager Parameter Store:
- `/kiro-worker/{env}/github-project-config`: GitHub Project configuration

## Monitoring

### CloudWatch Metrics

- Build success/failure rates
- Build duration
- Test failure rates
- Coverage percentages
- Lambda invocation counts
- DynamoDB lock acquisition metrics

### CloudWatch Alarms

- Build failure rate > 50%
- Build duration > 45 minutes
- Test failure rate > 15%
- Lambda errors
- DynamoDB throttling

### Logs

- CodeBuild logs: `/aws/codebuild/kiro-worker-{env}`
- Lambda logs: `/aws/lambda/kiro-worker-{env}-poller`

## Key Principles

### Code Quality

- TypeScript strict mode enabled
- No `any` types
- Explicit return types
- Comprehensive error handling
- Structured logging

### Testing

- Minimum 80% code coverage (enforced)
- Unit tests for all components
- Integration tests for workflows
- Property-based tests for critical logic
- All tests must pass (no exceptions)

### Security

- Least privilege IAM permissions
- Secrets in AWS Secrets Manager
- Encryption at rest and in transit
- No credentials in code or logs
- Input validation

### Performance

- Efficient AWS SDK usage (modular imports)
- Client reuse
- Parallel operations where possible
- Appropriate compute sizes
- Resource cleanup

## Contributing

1. Read all steering documentation in `.kiro/steering/`
2. Follow TypeScript standards
3. Follow testing standards (≥80% coverage, all tests pass)
4. Follow Git workflow (conventional commits, PR process)
5. Follow AWS CDK standards for infrastructure
6. Update documentation as needed

## Support

- Documentation: `docs/` directory
- Specifications: `.kiro/specs/` directory
- Standards: `.kiro/steering/` directory
- Issues: GitHub Issues
- Discussions: GitHub Discussions

## License

See LICENSE file for details.
