# Kiro CodeBuild Worker - Architecture Documentation

## System Overview

The Kiro CodeBuild Worker is an automated coding agent system that integrates Kiro CLI with AWS CodeBuild to perform code generation, testing, and pull request updates within CI/CD pipelines.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GitHub Ecosystem                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  GitHub Projects │  │  Git Repository  │  │  Pull Requests   │  │
│  │   (Work Items)   │  │  (Spec Files)    │  │   (Updates)      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ GitHub API
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS Cloud                                   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    EventBridge Scheduler                        │ │
│  │  Triggers: rate(5 minutes) for test, rate(15 min) for prod     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │
│                                    ↓
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Work Item Poller Lambda Function                   │ │
│  │  • Query GitHub Projects API                                    │ │
│  │  • Validate work items (branch, spec, PR)                       │ │
│  │  • Acquire DynamoDB lock                                        │ │
│  │  • Trigger CodeBuild project                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │
│                                    ↓
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    DynamoDB Locks Table                         │ │
│  │  • Ensures single work item execution                           │ │
│  │  • TTL-based lock expiration                                    │ │
│  │  • Conditional writes for mutual exclusion                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │
│                                    ↓
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    CodeBuild Project                            │ │
│  │  1. Checkout feature branch                                     │ │
│  │  2. Validate spec files and PR                                  │ │
│  │  3. Synchronize steering files                                  │ │
│  │  4. Execute Kiro CLI tasks                                      │ │
│  │  5. Run tests (must pass 100%)                                  │ │
│  │  6. Validate coverage (≥80%)                                    │ │
│  │  7. Update pull request                                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │
│                                    ↓
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    S3 Artifacts Bucket                          │ │
│  │  • Build logs                                                   │ │
│  │  • Test results                                                 │ │
│  │  • Coverage reports                                             │ │
│  │  • Git diffs                                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    CloudWatch Monitoring                        │ │
│  │  • Logs from Lambda and CodeBuild                               │ │
│  │  • Metrics (build success, duration, coverage)                  │ │
│  │  • Alarms (failures, timeouts, errors)                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │
│                                    ↓
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    SNS Notification Topics                      │ │
│  │  • Email alerts for build failures                              │ │
│  │  • Environment-specific thresholds                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Secrets Manager                              │ │
│  │  • GitHub API tokens                                            │ │
│  │  • Git credentials                                              │ │
│  │  • Encrypted with KMS                                           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Work Item Poller Lambda

**Purpose**: Polls GitHub Projects for work items ready for implementation

**Responsibilities**:
- Query GitHub Projects API every N minutes
- Filter work items in "For Implementation" status
- Validate work items (branch exists, spec files exist, PR exists)
- Sort by creation date (oldest first)
- Acquire DynamoDB lock for selected work item
- Trigger CodeBuild with work item parameters
- Handle errors and send to Dead Letter Queue

**Configuration**:
- Runtime: Node.js 18
- Timeout: 15 minutes
- Memory: 512 MB
- Trigger: EventBridge scheduled rule

**Environment Variables**:
- `LOCKS_TABLE_NAME`: DynamoDB table name
- `GITHUB_TOKEN_SECRET_ARN`: Secrets Manager ARN
- `CODEBUILD_PROJECT_NAME`: CodeBuild project name
- `ENVIRONMENT`: test | staging | production

### 2. CodeBuild Worker

**Purpose**: Executes Kiro CLI tasks and validates code quality

**Build Phases**:

1. **Pre-Build**:
   - Retrieve credentials from Secrets Manager
   - Checkout feature branch
   - Validate spec files exist
   - Validate pull request exists

2. **Build**:
   - Synchronize steering files from Kiro Power
   - Execute Kiro CLI with spec tasks
   - Capture output and track file changes

3. **Post-Build**:
   - Run test suite (npm test)
   - Analyze code coverage
   - Validate coverage ≥80%
   - Generate test summary
   - Update pull request with results
   - Upload artifacts to S3

**Configuration**:
- Compute: SMALL (3 GB, 2 vCPUs)
- Timeout: 60 minutes
- Build Image: aws/codebuild/standard:7.0

**Environment Variables**:
- `ENVIRONMENT`: test | staging | production
- `BRANCH_NAME`: Feature branch name
- `SPEC_PATH`: Path to spec folder
- `COVERAGE_THRESHOLD`: Minimum coverage (80)

### 3. DynamoDB Locks Table

**Purpose**: Ensures only one work item processes at a time

**Schema**:
```
Primary Key: lockKey (String)
Attributes:
  - lockId: Unique lock identifier
  - workItemId: Work item being processed
  - buildId: CodeBuild build ID
  - expiresAt: TTL timestamp (auto-delete)
  - status: in_progress | complete | failed
  - createdAt: Lock creation timestamp
```

**Lock Acquisition**:
- Conditional PutItem: `attribute_not_exists(lockKey) OR expiresAt < :now`
- TTL: 90 minutes (allows for build timeout + buffer)
- Automatic cleanup of expired locks

### 4. S3 Artifacts Bucket

**Purpose**: Store build artifacts for auditing and debugging

**Structure**:
```
{environment}/{build-id}/
  ├── logs/
  │   ├── build.log
  │   └── kiro-cli.log
  ├── reports/
  │   ├── test-results.json
  │   └── coverage-report.json
  ├── diffs/
  │   └── changes.diff
  └── metadata.json
```

**Lifecycle**:
- Transition to Infrequent Access after 30 days
- Delete after 90 days
- Versioning enabled

### 5. CloudWatch Monitoring

**Log Groups**:
- `/aws/lambda/kiro-worker-{env}-poller`: Lambda logs
- `/aws/codebuild/kiro-worker-{env}`: CodeBuild logs

**Metrics**:
- Build success/failure rates
- Build duration
- Test failure rates
- Coverage percentages
- Lambda invocation counts
- DynamoDB lock metrics

**Alarms**:
- Build failure rate > 50%
- Build duration > 45 minutes
- Test failure rate > 15%
- Lambda errors
- DynamoDB throttling

## Data Flow

### Work Item Processing Flow

```
1. EventBridge triggers Lambda
   ↓
2. Lambda queries GitHub Projects API
   ↓
3. Lambda validates work items:
   - Branch exists?
   - Spec files exist at .kiro/specs/{branch-name}/?
   - Pull request exists?
   ↓
4. Lambda sorts valid items by creation date (oldest first)
   ↓
5. Lambda attempts to acquire DynamoDB lock for first item
   ↓
6. If lock acquired:
   - Lambda triggers CodeBuild with parameters
   - Lambda returns success
   ↓
7. If lock not acquired (another build in progress):
   - Lambda returns (will try again on next poll)
   ↓
8. CodeBuild executes:
   a. Checkout branch
   b. Sync steering
   c. Execute Kiro CLI
   d. Run tests
   e. Check coverage
   f. Update PR
   ↓
9. CodeBuild releases lock (success or failure)
   ↓
10. CloudWatch logs all operations
    ↓
11. SNS sends notifications if alarms triggered
```

### Pipeline Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CodeBuild Pipeline                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Git Branch Management                              │
│  • Retrieve Git credentials from Secrets Manager             │
│  • Checkout feature branch                                   │
│  • Validate branch exists                                    │
│  • Retry with exponential backoff on failures                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Validation                                         │
│  • Check spec files exist (requirements.md, design.md,       │
│    tasks.md)                                                 │
│  • Verify pull request exists for branch                     │
│  • Fail fast if validation fails                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Steering Synchronization                           │
│  • Fetch Kiro Power manifest                                 │
│  • Compare versions                                          │
│  • Download updated steering files                           │
│  • Commit changes if needed                                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Kiro CLI Execution                                 │
│  • Execute: kiro execute-task --spec {specPath} --task {id} │
│  • Capture stdout/stderr                                     │
│  • Track file changes (git diff)                             │
│  • Handle timeouts (60 min max)                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 5: Test Execution                                     │
│  • Run: npm test                                             │
│  • Capture test results                                      │
│  • Parse coverage report (Istanbul/NYC JSON)                 │
│  • Fail if any tests fail                                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 6: Coverage Validation                                │
│  • Calculate coverage percentages                            │
│  • Check: lines, functions, branches, statements ≥80%        │
│  • Fail if coverage below threshold                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 7: Pull Request Update                                │
│  • Retrieve GitHub API token from Secrets Manager            │
│  • Generate PR body with results                             │
│  • Update existing PR                                        │
│  • Retry up to 3 times on API failures                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 8: Artifact Upload                                    │
│  • Upload logs to S3                                         │
│  • Upload test results to S3                                 │
│  • Upload coverage reports to S3                             │
│  • Upload git diffs to S3                                    │
│  • Sanitize secrets from all artifacts                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 9: Cleanup                                            │
│  • Release DynamoDB lock                                     │
│  • Report build status (exit code)                           │
│  • Log final summary                                         │
└─────────────────────────────────────────────────────────────┘
```

## Security Architecture

### Authentication & Authorization

1. **IAM Roles**:
   - CodeBuild execution role with least-privilege permissions
   - Lambda execution role with minimal required permissions
   - No long-lived credentials

2. **Secrets Management**:
   - All credentials stored in AWS Secrets Manager
   - Encrypted with KMS
   - Automatic rotation supported
   - Retrieved at runtime only

3. **Network Security**:
   - CodeBuild can run in VPC (optional)
   - Security groups restrict access
   - No public endpoints

### Data Protection

1. **Encryption at Rest**:
   - S3 buckets: SSE-S3 or SSE-KMS
   - DynamoDB: AWS-managed encryption
   - Secrets Manager: KMS encryption
   - CloudWatch Logs: KMS encryption (optional)

2. **Encryption in Transit**:
   - All AWS API calls use HTTPS
   - GitHub API calls use HTTPS
   - TLS 1.2+ required

3. **Secret Sanitization**:
   - All logs sanitized before writing
   - Tokens, passwords, secrets redacted
   - Regex-based pattern matching

## Scalability & Performance

### Concurrency Control

- **Single Work Item Processing**: DynamoDB locks ensure only one work item processes at a time
- **Configurable Polling**: Adjust EventBridge schedule based on load
- **Future Enhancement**: Support parallel processing with configurable concurrency limit

### Performance Optimization

1. **Lambda**:
   - Warm starts with provisioned concurrency (optional)
   - Efficient GitHub API queries
   - Minimal dependencies

2. **CodeBuild**:
   - Caching enabled for dependencies
   - SMALL compute size (upgradable if needed)
   - Parallel test execution

3. **DynamoDB**:
   - On-demand billing (auto-scales)
   - Single-digit millisecond latency
   - TTL for automatic cleanup

## Disaster Recovery

### Backup Strategy

1. **DynamoDB**:
   - Point-in-time recovery enabled (production)
   - Automatic backups

2. **S3**:
   - Versioning enabled
   - Cross-region replication (optional)
   - 90-day retention

3. **Infrastructure**:
   - Infrastructure as Code (CDK)
   - Version controlled
   - Reproducible deployments

### Failure Handling

1. **Lambda Failures**:
   - Dead Letter Queue (SQS)
   - Automatic retries (0 - handled in code)
   - CloudWatch alarms

2. **CodeBuild Failures**:
   - Build logs preserved in S3
   - CloudWatch alarms
   - PR updated with failure details

3. **Lock Expiration**:
   - TTL-based automatic cleanup
   - Stale work detection
   - Manual intervention tools

## Monitoring & Observability

### Metrics

- Build success rate
- Build duration (p50, p95, p99)
- Test failure rate
- Coverage percentage
- Lambda invocation count
- Lambda duration
- DynamoDB read/write capacity
- API call rates

### Logging

- Structured JSON logs
- Correlation IDs for tracing
- Log levels: DEBUG, INFO, WARN, ERROR
- Centralized in CloudWatch Logs

### Alerting

- SNS topics per environment
- Email notifications
- Environment-specific thresholds
- Escalation policies

## Cost Optimization

### Resource Sizing

- Lambda: 512 MB (right-sized for workload)
- CodeBuild: SMALL compute (3 GB, 2 vCPUs)
- DynamoDB: On-demand billing
- S3: Lifecycle policies (IA after 30 days, delete after 90 days)

### Cost Monitoring

- AWS Cost Explorer tags
- Budget alerts
- Resource utilization metrics

## Future Enhancements

1. **Parallel Processing**: Support multiple concurrent work items
2. **GitLab Support**: Extend to GitLab Projects and MRs
3. **Advanced Retry**: Configurable retry strategies per operation
4. **Custom Notifications**: Slack, Teams, PagerDuty integrations
5. **Enhanced Metrics**: Custom dashboards and analytics
6. **Multi-Region**: Deploy across multiple AWS regions
7. **Blue/Green Deployments**: Zero-downtime infrastructure updates

## References

- [Deployment Guide](../deployment/DEPLOYMENT.md)
- [Prerequisites](../deployment/prerequisites.md)
- [IAM Permissions](../deployment/iam-permissions.md)
- [Troubleshooting](../deployment/troubleshooting.md)
