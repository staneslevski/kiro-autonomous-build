# Design Document: Kiro CodeBuild Worker

## Overview

The Kiro CodeBuild Worker is an automated coding agent system that integrates Kiro CLI with AWS CodeBuild to perform code generation, testing, and pull request creation within CI/CD pipelines. The system operates on feature branches across multiple deployment environments (test, staging, production), ensuring code quality through automated testing and coverage validation before creating pull requests.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Projects Board                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Work Items in "For Implementation" Status            │  │
│  │  - Item 1: Feature Branch A (with spec files)        │  │
│  │  - Item 2: Feature Branch B (with spec files)        │  │
│  └───────────────────────────────────────────────────────┘  │
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
│  1. Query GitHub Projects API for work items                │
│  2. Filter items in target status column                    │
│  3. Validate branch and spec files exist                    │
│  4. Acquire DynamoDB lock for single execution              │
│  5. Trigger CodeBuild if work available                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     AWS CodeBuild                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Kiro Worker Container                     │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  1. Git Branch Manager (checkout existing)     │  │  │
│  │  │  2. Steering Synchronizer                       │  │  │
│  │  │  3. Kiro CLI Executor                           │  │  │
│  │  │  4. Test Runner & Coverage Analyzer             │  │  │
│  │  │  5. Pull Request Creator                        │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ├──────> AWS Secrets Manager (Credentials)
                          ├──────> CloudWatch Logs (Logging)
                          ├──────> S3 (Artifacts)
                          ├──────> DynamoDB (Work Item Locking)
                          ├──────> CloudWatch Alarms (Monitoring)
                          └──────> SNS Topics (Notifications)
```

### Design Decisions

**Decision 1: Sequential Pipeline Architecture**
- Rationale: A linear pipeline (branch → sync → execute → test → PR) ensures each step completes successfully before proceeding, making failures easier to diagnose and recover from.
- Trade-off: Slightly longer execution time vs. reliability and debuggability.

**Decision 2: Existing Feature Branch Model**
- Rationale: Workers operate on existing feature branches that already contain spec files (requirements.md, design.md, tasks.md), ensuring work is performed with complete context and specifications already defined.
- Implementation: Workers receive branch names from work items and validate that the branch exists with required spec files before proceeding.
- Trade-off: Requires upfront spec creation vs. ensures well-defined work scope and requirements.

**Decision 3: Fail-Fast on Coverage**
- Rationale: Enforcing 80% code coverage threshold prevents low-quality generated code from entering the codebase.
- Trade-off: May require additional work to achieve coverage vs. maintaining code quality standards.

**Decision 4: Centralized Steering via Kiro Power**
- Rationale: Centralizing coding standards and best practices in a versioned Kiro Power ensures consistency across all projects and simplifies updates.
- Implementation: Workers synchronize steering files at the start of each execution.

**Decision 5: Notification Interface Abstraction**
- Rationale: Abstracting notification delivery from alarm configuration allows future migration from SNS to SES without infrastructure changes.
- Implementation: Clean interface layer between CloudWatch Alarms and notification delivery.

**Decision 6: Pre-Deployment Permission Validation**
- Rationale: Validating IAM permissions before attempting deployment prevents partial deployments and provides clear, actionable error messages when permissions are insufficient.
- Implementation: Use AWS IAM SimulatePrincipalPolicy API to check permissions before CloudFormation operations.
- Trade-off: Additional validation time vs. faster failure detection and better error messages.

**Decision 7: Automated Deployment Scripts**
- Rationale: Providing deployment automation scripts reduces manual errors, ensures consistent deployments, and handles stack dependencies automatically.
- Implementation: Shell scripts with validation, progress reporting, and error handling.
- Trade-off: Script maintenance overhead vs. improved deployment reliability and user experience.

**Decision 8: GitHub Projects as Work Queue**
- Rationale: Using GitHub Projects as the work item source integrates naturally with existing development workflows and provides a familiar interface for managing work.
- Implementation: Poll GitHub Projects API for items in a specific status column (e.g., "For Implementation").
- Trade-off: Dependency on GitHub API availability vs. seamless integration with developer workflows.

**Decision 9: Scheduled Polling Architecture**
- Rationale: EventBridge scheduled rules provide reliable, configurable triggering without requiring webhook infrastructure or exposing endpoints.
- Implementation: EventBridge rule triggers Lambda function on schedule (e.g., every 5 minutes) to check for work items.
- Trade-off: Slight delay in work pickup (polling interval) vs. simpler architecture without webhook management.

**Decision 10: Single Work Item Execution with DynamoDB Locking**
- Rationale: Processing one work item at a time prevents resource contention, ensures predictable execution, and simplifies error handling and recovery.
- Implementation: Use DynamoDB conditional writes to implement distributed locking, ensuring only one worker processes work at a time.
- Trade-off: Sequential processing (slower throughput) vs. resource efficiency and simplified concurrency management.

**Decision 11: Pull Request Updates vs Creation**
- Rationale: Since work items reference existing branches with existing pull requests, workers update PRs rather than create new ones, maintaining continuity of review discussions and history.
- Implementation: Workers find existing PRs by branch name and update the PR body with build results, test summaries, and coverage information.
- Trade-off: Requires PR to exist before worker runs vs. preserves review context and discussion threads.

## Component Design

### 1. Git Branch Manager

**Responsibility**: Manages Git operations including checking out existing branches, validating spec files, commits, and pushes.

**Interface**:
```typescript
interface GitBranchManager {
  checkoutBranch(branchName: string): Promise<void>;
  validateSpecFiles(branchName: string): Promise<ValidationResult>;
  validatePullRequestExists(branchName: string): Promise<boolean>;
  commitChanges(message: string, files: string[]): Promise<void>;
  pushBranch(branchName: string): Promise<void>;
}

interface ValidationResult {
  branchExists: boolean;
  specFolderExists: boolean;
  requiredFilesExist: {
    requirements: boolean;
    design: boolean;
    tasks: boolean;
  };
  errors: string[];
}
```

**Implementation Details**:
- Receive branch name from work item metadata
- Verify branch exists in remote repository
- Checkout the specified branch
- Validate `.kiro/specs/{branch-name}/` folder exists
- Verify requirements.md, design.md, and tasks.md files exist
- Verify that a pull request exists with the matching branch name
- Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
- Credential source: AWS Secrets Manager or Systems Manager Parameter Store

**Error Handling**:
- Git operation failures trigger retries
- After 3 failed attempts, log detailed error and fail build
- If branch doesn't exist, fail immediately with clear error message
- If spec files are missing, fail with specific list of missing files
- If pull request doesn't exist, fail with clear error message
- Sanitize credential information from error messages

### 2. Steering Synchronizer

**Responsibility**: Ensures repository has up-to-date steering files from the centralized Kiro Power.

**Interface**:
```typescript
interface SteeringSynchronizer {
  checkSteeringVersion(): Promise<VersionInfo>;
  synchronizeSteeringFiles(): Promise<SyncResult>;
  commitSteeringUpdates(files: string[]): Promise<void>;
}

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  missingFiles: string[];
}

interface SyncResult {
  addedFiles: string[];
  updatedFiles: string[];
  errors: string[];
}
```

**Implementation Details**:
- Check `.kiro/steering/` directory for existing files
- Compare version metadata with Kiro Power manifest
- Download missing or outdated files
- Commit steering updates to feature branch before executing tasks
- Log all synchronization operations

**Steering Files Included**:
- Git workflow guidelines
- Testing standards and coverage requirements
- Code review checklist
- Deployment practices
- Language-specific coding standards

### 3. Kiro CLI Executor

**Responsibility**: Executes Kiro CLI commands with specified spec tasks.

**Interface**:
```typescript
interface KiroCLIExecutor {
  executeTask(taskId: string, options: ExecutionOptions): Promise<ExecutionResult>;
  captureOutput(): Promise<string>;
  trackFileChanges(): Promise<string[]>;
}

interface ExecutionOptions {
  specPath: string;
  taskId: string;
  customArgs?: string[];
  timeout?: number;
}

interface ExecutionResult {
  success: boolean;
  output: string;
  modifiedFiles: string[];
  errors?: string[];
}
```

**Implementation Details**:
- Execute: `kiro execute-task --spec {specPath} --task {taskId}`
- Capture stdout and stderr streams
- Track file system changes using git diff
- Respect CodeBuild timeout limits (default: 60 minutes)
- Handle timeout gracefully with partial results

**Error Handling**:
- Capture Kiro CLI error output
- Log detailed error information to CloudWatch
- Fail build immediately on CLI errors
- Include error context in build failure message

### 4. Test Runner & Coverage Analyzer

**Responsibility**: Executes test suites and validates code coverage meets threshold.

**Interface**:
```typescript
interface TestRunner {
  runTests(config: TestConfig): Promise<TestResult>;
  analyzeCoverage(): Promise<CoverageResult>;
  generateTestSummary(): Promise<string>;
}

interface TestConfig {
  testCommand?: string;  // Default: npm test
  coverageCommand?: string;  // Default: npm run coverage
  coverageThreshold: number;  // Default: 80
}

interface TestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  output: string;
  failures: TestFailure[];
}

interface CoverageResult {
  percentage: number;
  meetsThreshold: boolean;
  coverageByFile: Map<string, number>;
  summary: string;
}

interface TestFailure {
  testName: string;
  error: string;
  stackTrace: string;
}
```

**Implementation Details**:
- Default test command: `npm test` (configurable via buildspec.yml)
- Default coverage command: `npm run coverage` (configurable)
- Parse coverage reports (support Istanbul/NYC format)
- Fail build if coverage < 80%
- Capture and log all test output
- Generate human-readable test summary for PR body

**Coverage Validation**:
1. Run test suite with coverage enabled
2. Parse coverage report
3. Calculate overall coverage percentage
4. Compare against threshold (80%)
5. Fail build if below threshold
6. Include coverage details in PR description

### 5. Pull Request Updater

**Responsibility**: Updates existing pull requests with comprehensive descriptions and metadata.

**Interface**:
```typescript
interface PullRequestUpdater {
  updatePR(details: PRDetails): Promise<PRResult>;
  generatePRBody(context: PRContext): string;
}

interface PRDetails {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  body: string;
  metadata: PRMetadata;
}

interface PRMetadata {
  buildId: string;
  buildUrl: string;
  specTask: string;
  testSummary: string;
  coveragePercentage: number;
  modifiedFiles: string[];
}

interface PRResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
}

interface PRContext {
  taskId: string;
  testResult: TestResult;
  coverageResult: CoverageResult;
  buildMetadata: BuildMetadata;
}
```

**Implementation Details**:
- Use GitHub API or GitLab API (detect from repository URL)
- Retrieve API token from AWS Secrets Manager
- Find existing PR by branch name using GitHub/GitLab API
- Update PR body with new information (build results, test summary, coverage)
- PR title format: `[Kiro Worker] {task-description}` (preserved from original PR)
- PR body includes:
  - Task description and reference
  - Test summary (passed/failed counts)
  - Coverage percentage
  - Link to CodeBuild execution
  - List of modified files
  - Kiro CLI output
- Retry PR update up to 3 times on API failures
- If PR doesn't exist, fail build with clear error message

**PR Body Template**:
```markdown
## Kiro Worker Automated Changes

**Spec Task**: {taskId}
**Build ID**: {buildId}
**Build URL**: {buildUrl}

### Test Results
- Total Tests: {totalTests}
- Passed: {passedTests}
- Failed: {failedTests}
- Coverage: {coveragePercentage}%

### Modified Files
- {file1}
- {file2}
...

### Kiro CLI Output
```
{kiroOutput}
```
```

### 6. GitHub Project Monitor

**Responsibility**: Queries GitHub Projects API to retrieve work items ready for implementation.

**Interface**:
```typescript
interface GitHubProjectMonitor {
  fetchWorkItems(config: ProjectConfig): Promise<WorkItem[]>;
  validateWorkItem(item: WorkItem): Promise<ValidationResult>;
  extractBranchName(item: WorkItem): string;
  verifyPullRequestExists(branchName: string): Promise<boolean>;
}

interface ProjectConfig {
  organization: string;
  repository: string;
  projectNumber: number;
  targetStatusColumn: string;  // e.g., "For Implementation"
}

interface WorkItem {
  id: string;
  title: string;
  description: string;
  branchName: string;
  status: string;
  createdAt: Date;
  priority?: number;
}

interface ValidationResult {
  isValid: boolean;
  branchExists: boolean;
  specFolderExists: boolean;
  specFolderMatchesBranch: boolean;
  pullRequestExists: boolean;
  pullRequestMatchesBranch: boolean;
  errors: string[];
}
```

**Implementation Details**:
- Use GitHub Projects GraphQL API (v2) to query project items
- Filter items by status column name (configurable, e.g., "For Implementation")
- Extract branch name from work item metadata or custom fields
- Validate that branch exists in repository
- Verify `.kiro/specs/{branch-name}/` folder exists and matches branch name
- Confirm pull request exists with title matching the branch name
- Retrieve GitHub API token from AWS Secrets Manager
- Implement rate limit handling with exponential backoff
- Respect GitHub API rate limits (5000 requests/hour for authenticated requests)

**Validation Logic**:
- Branch name must match a folder in `.kiro/specs/`
- Pull request title must match the branch name
- All three must be consistent: work item → branch → spec folder → PR title

**Error Handling**:
- API failures trigger retry with exponential backoff (3 attempts)
- Rate limit errors wait for rate limit reset time
- Log detailed error information for API failures
- Return empty work item list on persistent failures
- Sanitize API tokens from error messages

### 7. Work Item Poller (Lambda Function)

**Responsibility**: Scheduled function that checks for available work and triggers CodeBuild executions.

**Interface**:
```typescript
interface WorkItemPoller {
  poll(): Promise<PollResult>;
  acquireLock(workItemId: string): Promise<boolean>;
  releaseLock(workItemId: string): Promise<void>;
  triggerCodeBuild(workItem: WorkItem, environment: string): Promise<BuildResult>;
}

interface PollResult {
  workItemsFound: number;
  workItemTriggered?: WorkItem;
  lockAcquired: boolean;
  buildTriggered: boolean;
  errors: string[];
}

interface BuildResult {
  buildId: string;
  buildArn: string;
  success: boolean;
  error?: string;
}
```

**Implementation Details**:
- Triggered by EventBridge scheduled rule (configurable interval, default: 5 minutes)
- Query GitHub Projects for work items in target status
- Sort work items by creation date (oldest first) or priority field
- Attempt to acquire DynamoDB lock for single execution
- If lock acquired, select first available work item
- Trigger CodeBuild project with work item metadata
- Pass branch name, spec path, and environment as build parameters
- Release lock after CodeBuild trigger (or on failure)
- Log all operations to CloudWatch Logs

**Concurrency Control**:
- Use DynamoDB table with conditional writes for distributed locking
- Lock key: `work-item-processor-lock`
- Lock attributes: `lockId`, `workItemId`, `acquiredAt`, `expiresAt`, `buildId`
- Lock TTL: 2 hours (maximum build duration)
- Acquire lock: Conditional PutItem (only if lock doesn't exist or expired)
- Release lock: DeleteItem with condition on lockId
- Handle lock expiration for crashed/timed-out builds

**Error Handling**:
- GitHub API failures logged and retried on next schedule
- DynamoDB lock failures indicate concurrent execution (expected, skip)
- CodeBuild trigger failures logged and lock released
- Lambda timeout handling: Release lock before timeout
- Dead letter queue for failed Lambda invocations

### 8. Work Item State Manager

**Responsibility**: Manages work item state transitions and DynamoDB locking for concurrency control.

**Interface**:
```typescript
interface WorkItemStateManager {
  acquireWorkLock(): Promise<LockResult>;
  releaseWorkLock(lockId: string): Promise<void>;
  markWorkItemInProgress(workItemId: string, buildId: string): Promise<void>;
  markWorkItemComplete(workItemId: string): Promise<void>;
  markWorkItemFailed(workItemId: string, error: string): Promise<void>;
  detectStaleWorkItems(): Promise<WorkItem[]>;
}

interface LockResult {
  acquired: boolean;
  lockId: string;
  expiresAt: Date;
  reason?: string;
}
```

**Implementation Details**:
- DynamoDB table: `kiro-worker-locks`
- Primary key: `lockKey` (string, always "work-item-processor-lock")
- Attributes: `lockId` (UUID), `workItemId`, `buildId`, `acquiredAt`, `expiresAt`, `status`
- Lock acquisition: Conditional PutItem with condition `attribute_not_exists(lockKey) OR expiresAt < :now`
- Lock release: DeleteItem with condition `lockId = :lockId`
- Lock expiration: 2 hours (covers maximum CodeBuild timeout)
- Stale work detection: Query for locks with `expiresAt < now` and `status = in_progress`

**State Transitions**:
1. Work item found → Acquire lock → Mark "in_progress"
2. Build completes successfully → Mark "complete" → Release lock
3. Build fails → Mark "failed" → Release lock
4. Build times out → Lock expires → Stale work detection marks "failed"

**Error Handling**:
- Lock acquisition failure (already locked): Return `acquired: false`, log and skip
- DynamoDB service errors: Retry with exponential backoff (3 attempts)
- Lock release failure: Log error but don't fail build (lock will expire)
- Stale work detection runs on schedule to clean up expired locks

**DynamoDB Table Schema**:
```typescript
interface WorkLockRecord {
  lockKey: string;           // PK: Always "work-item-processor-lock"
  lockId: string;            // UUID for this lock acquisition
  workItemId: string;        // GitHub work item ID
  buildId: string;           // CodeBuild build ID
  acquiredAt: number;        // Unix timestamp
  expiresAt: number;         // Unix timestamp (TTL)
  status: 'in_progress' | 'complete' | 'failed';
  environment: string;       // test, staging, production
}
```

## Complete Workflow

### End-to-End Execution Flow

**Phase 1: Work Item Discovery**
1. EventBridge scheduled rule triggers Work Item Poller Lambda (every N minutes)
2. Lambda queries GitHub Projects API for work items in target status column
3. Lambda validates each work item:
   - Branch exists in repository
   - Spec folder exists at `.kiro/specs/{branch-name}/` and matches branch name
   - Pull request exists with title matching the branch name
   - All three are consistent: work item → branch → spec folder → PR title
4. Lambda sorts valid work items by creation date (oldest first) or priority

**Phase 2: Concurrency Control**
5. Lambda attempts to acquire DynamoDB lock using conditional write
6. If lock already held (another execution in progress):
   - Log "Work already in progress" and exit
   - Wait for next scheduled trigger
7. If lock acquired:
   - Store lock metadata (lockId, workItemId, buildId, expiresAt)
   - Proceed to trigger CodeBuild

**Phase 3: CodeBuild Trigger**
8. Lambda triggers CodeBuild project with parameters:
   - `BRANCH_NAME`: Feature branch from work item
   - `SPEC_PATH`: Path to spec folder (`.kiro/specs/{branch-name}`)
   - `ENVIRONMENT`: test/staging/production
   - `WORK_ITEM_ID`: GitHub work item ID
9. Lambda marks work item as "in_progress" in DynamoDB
10. Lambda exits (lock remains held until build completes)

**Phase 4: Kiro Worker Execution** (CodeBuild)
11. CodeBuild starts, reads environment variables
12. Git Branch Manager:
    - Checkout specified feature branch
    - Validate spec files exist (requirements.md, design.md, tasks.md)
    - Validate pull request exists with matching branch name
    - Fail build if validation fails
13. Steering Synchronizer:
    - Check steering file versions
    - Synchronize outdated files from Kiro Power
    - Commit steering updates to feature branch
14. Kiro CLI Executor:
    - Execute spec task: `kiro execute-task --spec {SPEC_PATH} --task {TASK_ID}`
    - Capture output and track file changes
15. Test Runner:
    - Execute test suite
    - Analyze code coverage
    - Fail build if coverage < 80% or tests fail
16. Pull Request Updater:
    - Generate PR body with test results and coverage
    - Update existing pull request with new information
    - Include build metadata and links
    - Fail build if PR doesn't exist

**Phase 5: Completion and Lock Release**
17. CodeBuild completes (success or failure)
18. Post-build hook or Lambda (triggered by CloudWatch Events):
    - Mark work item as "complete" or "failed" in DynamoDB
    - Release DynamoDB lock
19. Next scheduled trigger can now process next work item

**Phase 6: Monitoring and Alerting**
20. CloudWatch Alarms monitor:
    - Build failure rates
    - Build duration
    - Lambda errors
    - DynamoDB throttling
21. Alarms trigger SNS notifications on threshold breaches
22. Operations team receives alerts with context and recommended actions

### Error Recovery Scenarios

**Scenario 1: Lambda Timeout**
- Lambda timeout (15 minutes max)
- Lock remains in DynamoDB with expiration time
- Lock expires after 2 hours
- Stale work detection (separate scheduled Lambda) marks work item as failed
- Next work item can be processed

**Scenario 2: CodeBuild Timeout**
- CodeBuild timeout (configurable, max 8 hours)
- Build marked as failed by CodeBuild
- Post-build hook releases lock
- Work item marked as failed
- Next work item can be processed

**Scenario 3: GitHub API Failure**
- Lambda retries with exponential backoff (3 attempts)
- If all retries fail, Lambda exits without acquiring lock
- Next scheduled trigger retries
- CloudWatch alarm triggers if failure rate exceeds threshold

**Scenario 4: DynamoDB Service Error**
- Lambda retries lock acquisition (3 attempts)
- If all retries fail, Lambda exits
- Next scheduled trigger retries
- CloudWatch alarm triggers if error rate exceeds threshold

**Scenario 5: No Work Available**
- Lambda queries GitHub Projects
- No work items in target status
- Lambda logs "No work available" and exits
- Next scheduled trigger checks again
- Normal operation, no alarms

## Configuration Management

### buildspec.yml Structure

```yaml
version: 0.2

env:
  variables:
    ENVIRONMENT: "test"  # test, staging, production
    BRANCH_NAME: ""  # Passed from work item poller
    SPEC_PATH: ""  # Passed from work item poller (e.g., .kiro/specs/feature-name)
    SPEC_TASK_ID: "task-123"
    COVERAGE_THRESHOLD: "80"
  parameter-store:
    GIT_TOKEN: "/kiro-worker/git-token"
    API_TOKEN: "/kiro-worker/api-token"

phases:
  install:
    commands:
      - npm install -g kiro-cli
  pre_build:
    commands:
      - echo "Initializing Kiro Worker"
      - echo "Branch: $BRANCH_NAME"
      - echo "Spec Path: $SPEC_PATH"
  build:
    commands:
      - kiro-worker execute
  post_build:
    commands:
      - echo "Build completed"

artifacts:
  files:
    - '**/*'
  name: kiro-worker-artifacts
```

### GitHub Project Configuration

**Configuration Parameters** (stored in Parameter Store or environment variables):
```typescript
interface GitHubProjectConfig {
  organization: string;           // GitHub organization name
  repository: string;             // Repository name
  projectNumber: number;          // GitHub Project number
  targetStatusColumn: string;     // Status column to monitor (e.g., "For Implementation")
  pollingInterval: string;        // EventBridge schedule expression (e.g., "rate(5 minutes)")
}
```

**Example Configuration**:
```json
{
  "organization": "my-org",
  "repository": "my-repo",
  "projectNumber": 1,
  "targetStatusColumn": "For Implementation",
  "pollingInterval": "rate(5 minutes)"
}
```

**Configuration Storage**:
- Parameter Store path: `/kiro-worker/{environment}/github-project-config`
- Separate configurations for test, staging, production environments
- Lambda function reads configuration on each invocation

### Environment-Specific Configuration

**Test Environment**:
- Relaxed timeout limits
- Verbose logging enabled
- Test-specific AWS credentials
- Lower coverage threshold (optional)

**Staging Environment**:
- Standard timeout limits
- Standard logging
- Staging-specific AWS credentials
- Standard coverage threshold (80%)

**Production Environment**:
- Strict timeout limits
- Minimal logging (security)
- Production AWS credentials
- Strict coverage threshold (80%)

**Configuration Loading Priority**:
1. CodeBuild environment variables
2. buildspec.yml in repository
3. Default values

## Multi-Environment Support

### Environment Parameter

The worker accepts an `ENVIRONMENT` parameter with values:
- `test`: Test environment configuration
- `staging`: Staging environment configuration
- `production`: Production environment configuration

### Environment-Specific Behavior

**Credential Resolution**:
- Test: `/kiro-worker/test/*` in Parameter Store
- Staging: `/kiro-worker/staging/*` in Parameter Store
- Production: `/kiro-worker/production/*` in Parameter Store

**Logging Verbosity**:
- Test: DEBUG level
- Staging: INFO level
- Production: WARN level

**Note**: Branch names are determined by work items and are not generated by the worker. Workers operate on existing feature branches that already contain spec files.

## Security Design

### Credential Management

**Storage**:
- Git credentials: AWS Secrets Manager
- API tokens: AWS Secrets Manager
- Configuration parameters: Systems Manager Parameter Store

**Access**:
- IAM role attached to CodeBuild project
- Least-privilege permissions
- No credentials in environment variables or logs

**Credential Types**:
1. Git repository access token
2. GitHub/GitLab API token for PR creation
3. AWS credentials (via IAM role)

### Secret Sanitization

**Log Filtering**:
- Redact tokens and passwords from logs
- Replace with `[REDACTED]` placeholder
- Apply to stdout, stderr, and CloudWatch Logs

**Error Messages**:
- Sanitize credential information from error messages
- Provide generic error messages for credential failures
- Log detailed errors to secure audit log (restricted access)

## Monitoring and Alerting

### CloudWatch Metrics

**Build Metrics**:
- Build success rate (per environment)
- Build duration (p50, p95, p99)
- Build failure rate
- Queue time

**Operation Metrics**:
- Git operation failures
- Test failure rate
- Coverage percentage (average)
- PR creation success rate

**Resource Metrics**:
- CPU utilization
- Memory utilization
- Network I/O
- Disk I/O

### CloudWatch Alarms

**Alarm Configuration**:
```typescript
interface AlarmConfig {
  metricName: string;
  warningThreshold: number;
  errorThreshold: number;
  evaluationPeriods: number;
  datapointsToAlarm: number;
}
```

**Critical Alarms** (Error Threshold):
- Build failure rate > 50% over 5 minutes
- PR creation failure rate > 30% over 5 minutes
- Average build duration > 45 minutes
- Memory utilization > 90%

**Warning Alarms** (Warning Threshold):
- Build failure rate > 25% over 10 minutes
- Test failure rate > 15% over 10 minutes
- Average coverage < 85%
- Average build duration > 30 minutes

### Notification Interface

**Design**:
```typescript
interface NotificationInterface {
  sendNotification(notification: Notification): Promise<void>;
}

interface Notification {
  severity: 'warning' | 'error';
  title: string;
  message: string;
  context: NotificationContext;
}

interface NotificationContext {
  environment: string;
  resource: string;
  metricName: string;
  metricValue: number;
  threshold: number;
  recommendedActions: string[];
}
```

**Implementation**:
- Initial: SNS Topic-based delivery
- Future: Amazon SES-based delivery
- Interface remains unchanged during migration

**SNS Topic Structure**:
- Test environment: `kiro-worker-test-alerts`
- Staging environment: `kiro-worker-staging-alerts`
- Production environment: `kiro-worker-production-alerts`

**Notification Payload**:
```json
{
  "severity": "error",
  "title": "High Build Failure Rate",
  "message": "Build failure rate exceeded 50% threshold",
  "context": {
    "environment": "production",
    "resource": "kiro-worker-prod-project",
    "metricName": "BuildFailureRate",
    "metricValue": 0.65,
    "threshold": 0.50,
    "recommendedActions": [
      "Check recent code changes",
      "Review CloudWatch Logs for error patterns",
      "Verify credential validity"
    ]
  }
}
```

## Error Handling and Recovery

### Retry Strategy

**Exponential Backoff**:
```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;  // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};
```

**Retryable Operations**:
- Git clone, pull, push
- API calls (GitHub/GitLab)
- AWS service calls (Secrets Manager, S3)

**Non-Retryable Failures**:
- Kiro CLI execution errors
- Test failures
- Coverage below threshold
- Invalid configuration

### Failure Scenarios

**Scenario 1: Git Operation Failure**
- Retry up to 3 times with exponential backoff
- Log each attempt
- After 3 failures, fail build with detailed error
- Clean up partial changes

**Scenario 2: Kiro CLI Failure**
- Capture error output
- Log to CloudWatch
- Fail build immediately (no retry)
- Include error in build summary

**Scenario 3: Test Failure**
- Capture test output and failures
- Log to CloudWatch
- Fail build immediately
- Include test summary in build output
- Do not create PR

**Scenario 4: Coverage Below Threshold**
- Log coverage percentage
- Fail build with coverage report
- Include coverage details in build output
- Do not create PR

**Scenario 5: PR Update Failure**
- Retry up to 3 times
- Log API errors
- After 3 failures, fail build
- Branch remains pushed (manual PR update possible)

**Scenario 6: PR Does Not Exist**
- Validate PR existence during Git Branch Manager phase
- Fail build immediately with clear error message
- Log missing PR information
- Do not proceed with Kiro CLI execution

### Resource Cleanup

**On Success**:
- Upload artifacts to S3
- Log completion summary
- Exit with status 0

**On Failure**:
- Upload partial artifacts to S3
- Log failure details
- Clean up temporary files
- Exit with non-zero status

**Timeout Handling**:
- Monitor remaining build time
- If < 5 minutes remaining, attempt graceful shutdown
- Save partial progress
- Log timeout warning

## Artifact Management

### S3 Artifact Structure

```
s3://kiro-worker-artifacts/{environment}/{build-id}/
  ├── logs/
  │   ├── kiro-cli.log
  │   ├── test-output.log
  │   └── git-operations.log
  ├── reports/
  │   ├── test-results.json
  │   ├── coverage-report.html
  │   └── coverage-summary.json
  ├── diffs/
  │   └── changes.diff
  └── metadata.json
```

### Artifact Types

**Logs**:
- Kiro CLI execution output
- Test execution output
- Git operation logs
- Error logs

**Reports**:
- Test results (JSON format)
- Coverage reports (HTML and JSON)
- Build summary

**Diffs**:
- Git diff of all changes
- File-by-file change summary

**Metadata**:
- Build ID and URL
- Environment
- Spec task ID
- Timestamps
- Success/failure status
- PR URL (if created)

## Deployment Architecture

### Deployment Documentation Structure

The repository will include comprehensive deployment documentation organized as follows:

**README.md** (Root level):
- Quick start guide
- Prerequisites overview
- Link to detailed deployment guide

**docs/deployment/DEPLOYMENT.md**:
- Detailed step-by-step deployment instructions
- Prerequisites and dependencies
- AWS account setup requirements
- IAM permission requirements with sample policies
- Environment-specific configuration guidance
- Troubleshooting common deployment issues
- Verification procedures
- Rollback procedures

**docs/deployment/prerequisites.md**:
- AWS CLI installation and configuration
- Required tools (Node.js, npm, etc.)
- AWS account requirements
- IAM user/role setup
- Region selection guidance

**docs/deployment/iam-permissions.md**:
- Complete IAM permission requirements
- Sample IAM policies for deployment
- Sample IAM policies for runtime
- Least-privilege permission explanations
- Permission validation procedures

**docs/deployment/troubleshooting.md**:
- Common deployment errors and solutions
- Permission-related error messages
- CloudFormation failure scenarios
- Credential configuration issues
- Network and VPC issues

### Infrastructure Stacks

**Stack 1: Core Infrastructure**
- S3 buckets for artifacts
- CloudWatch Log Groups
- IAM roles and policies
- DynamoDB table for work item locking
- Dependencies: None

**Stack 2: Secrets and Configuration**
- Secrets Manager secrets
- Parameter Store parameters (including GitHub Project config)
- KMS keys for encryption
- Dependencies: Stack 1

**Stack 3: Work Item Poller**
- Lambda function for polling GitHub Projects
- EventBridge scheduled rule
- IAM role for Lambda execution
- Dead letter queue (SQS) for failed invocations
- Dependencies: Stack 1, Stack 2

**Stack 4: CodeBuild Projects**
- CodeBuild projects (test, staging, production)
- Build compute environments
- VPC configuration (if needed)
- Dependencies: Stack 1, Stack 2

**Stack 5: Monitoring and Alerting**
- CloudWatch Alarms
- SNS Topics
- Alarm actions
- Dependencies: Stack 3, Stack 4

**Stack 6: Kiro Power**
- Kiro Power package with steering files
- Version manifest
- Distribution mechanism
- Dependencies: None (independent)

### Deployment Tooling

**Deployment Scripts**:
```bash
# deploy.sh - Main deployment orchestration script
./deploy.sh [--environment test|staging|production] [--stack all|1|2|3|4|5]
```

**Script Capabilities**:
- Validate AWS credentials and permissions before deployment
- Deploy individual stacks or all stacks sequentially
- Handle stack dependencies automatically
- Provide progress feedback and error reporting
- Support dry-run mode for validation without deployment
- Generate deployment reports with resource ARNs

**Deployment Script Interface**:
```typescript
interface DeploymentScript {
  validatePrerequisites(): Promise<ValidationResult>;
  deployStack(stackId: number, environment: string): Promise<DeploymentResult>;
  deployAll(environment: string): Promise<DeploymentSummary>;
  rollback(stackId: number): Promise<RollbackResult>;
}

interface DeploymentResult {
  success: boolean;
  stackName: string;
  stackId: string;
  outputs: Map<string, string>;
  errors?: string[];
}

interface DeploymentSummary {
  totalStacks: number;
  successfulStacks: number;
  failedStacks: number;
  deploymentTime: number;
  resourceArns: Map<string, string>;
}
```

### Deployment Sequence

1. Validate AWS credentials and IAM permissions
2. Deploy Stack 1 (Core Infrastructure including DynamoDB)
3. Deploy Stack 2 (Secrets and Configuration)
4. Populate secrets with actual credentials (manual step)
5. Configure GitHub Project parameters in Parameter Store (manual step)
6. Deploy Stack 3 (Work Item Poller Lambda and EventBridge)
7. Deploy Stack 4 (CodeBuild Projects)
8. Deploy Stack 5 (Monitoring and Alerting)
9. Deploy Stack 6 (Kiro Power)
10. Run post-deployment validation checks
11. Generate deployment report

### Required IAM Permissions

**Deployment Permissions** (for user/role deploying infrastructure):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutEncryptionConfiguration",
        "logs:CreateLogGroup",
        "logs:PutRetentionPolicy",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "codebuild:CreateProject",
        "codebuild:UpdateProject",
        "secretsmanager:CreateSecret",
        "secretsmanager:PutSecretValue",
        "ssm:PutParameter",
        "kms:CreateKey",
        "kms:CreateAlias",
        "kms:PutKeyPolicy",
        "cloudwatch:PutMetricAlarm",
        "sns:CreateTopic",
        "sns:Subscribe",
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:DescribeTable",
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:AddPermission",
        "events:PutRule",
        "events:PutTargets",
        "sqs:CreateQueue",
        "sqs:SetQueueAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```

**Runtime Permissions** (for CodeBuild execution role):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/codebuild/kiro-worker-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::kiro-worker-artifacts-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:kiro-worker-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/kiro-worker/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": [
            "secretsmanager.*.amazonaws.com",
            "ssm.*.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

**Lambda Execution Permissions** (for Work Item Poller):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/kiro-worker-poller-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:kiro-worker-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/kiro-worker/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/kiro-worker-locks"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:StartBuild"
      ],
      "Resource": "arn:aws:codebuild:*:*:project/kiro-worker-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:*:*:kiro-worker-poller-dlq"
    }
  ]
}
```

### Deployment Validation

**Pre-Deployment Validation**:
- Validate AWS credentials are configured
- Check IAM permissions before attempting deployment
- Verify required AWS services are available in target region
- Validate CloudFormation template syntax
- Check for naming conflicts with existing resources

**Permission Validation**:
```typescript
interface PermissionValidator {
  validateDeploymentPermissions(): Promise<ValidationResult>;
  checkRequiredPermissions(permissions: string[]): Promise<PermissionCheckResult>;
  generateMissingPermissionsReport(): string;
}

interface ValidationResult {
  hasRequiredPermissions: boolean;
  missingPermissions: string[];
  warnings: string[];
}

interface PermissionCheckResult {
  permission: string;
  allowed: boolean;
  reason?: string;
}
```

**Implementation**:
- Use AWS IAM `SimulatePrincipalPolicy` API to validate permissions
- Check each required permission before deployment
- Provide clear error messages indicating missing permissions
- Generate actionable IAM policy snippets for missing permissions

**Post-Deployment Checks**:
1. Verify all stacks deployed successfully
2. Confirm S3 buckets created with encryption enabled
3. Validate IAM roles have correct permissions
4. Test secret retrieval from Secrets Manager
5. Verify DynamoDB table created with correct schema
6. Test Lambda function invocation manually
7. Verify EventBridge rule is enabled and scheduled
8. Trigger test CodeBuild execution with sample work item
9. Verify CloudWatch Logs receiving data from Lambda and CodeBuild
10. Test alarm triggering (optional)
11. Confirm SNS topic subscriptions

**Deployment Rollback**:
- CloudFormation automatic rollback on failure
- Manual rollback: Delete stacks in reverse order (5, 4, 3, 2, 1)
- Preserve S3 artifacts during rollback (optional)

## Kiro Power Design

### Power Structure

```
kiro-codebuild-worker-power/
├── POWER.md                    # Power documentation
├── manifest.json               # Version and metadata
└── steering/
    ├── git-workflow.md
    ├── testing-standards.md
    ├── code-review.md
    ├── deployment-practices.md
    └── coding-standards/
        ├── typescript.md
        ├── python.md
        └── java.md
```

### Manifest Format

```json
{
  "name": "kiro-codebuild-worker-steering",
  "version": "1.0.0",
  "description": "Centralized steering documentation for Kiro CodeBuild Worker",
  "steeringFiles": [
    {
      "path": "steering/git-workflow.md",
      "checksum": "sha256:abc123...",
      "required": true
    },
    {
      "path": "steering/testing-standards.md",
      "checksum": "sha256:def456...",
      "required": true
    },
    {
      "path": "steering/code-review.md",
      "checksum": "sha256:ghi789...",
      "required": false
    }
  ],
  "updateNotificationUrl": "https://example.com/power-updates"
}
```

### Steering File Synchronization Logic

1. Read local `.kiro/steering/manifest.json` (if exists)
2. Fetch latest manifest from Kiro Power
3. Compare versions and checksums
4. Download missing or outdated files
5. Write files to `.kiro/steering/`
6. Update local manifest
7. Commit changes to feature branch

### Version Management

- Semantic versioning (MAJOR.MINOR.PATCH)
- Breaking changes increment MAJOR
- New steering files increment MINOR
- Content updates increment PATCH
- Workers log version mismatches as warnings

## Testing Strategy

### Unit Tests

**Components to Test**:
- GitBranchManager: Branch checkout, spec validation, PR validation, commit, push logic
- SteeringSynchronizer: Version comparison, file download
- KiroCLIExecutor: Command execution, output capture
- TestRunner: Test execution, coverage parsing
- PullRequestUpdater: PR body generation, PR update API calls
- GitHubProjectMonitor: Work item fetching, validation, branch extraction
- WorkItemPoller: Polling logic, lock acquisition, CodeBuild triggering
- WorkItemStateManager: Lock management, state transitions, stale work detection

**Test Coverage Target**: 80% minimum

### Integration Tests

**Scenarios**:
1. End-to-end worker execution (mock Kiro CLI)
2. Git operations with test repository
3. PR update with GitHub/GitLab test API
4. Credential retrieval from Secrets Manager
5. Artifact upload to S3
6. GitHub Projects API integration with mock responses
7. DynamoDB lock acquisition and release
8. Lambda to CodeBuild trigger flow
9. EventBridge scheduled trigger to Lambda
10. PR validation and error handling when PR doesn't exist

### Property-Based Tests

**Properties to Test**:
- Lock acquisition is mutually exclusive (only one holder at a time)
- Lock expiration always occurs after acquisition time
- Work item state transitions are valid (no invalid state changes)
- Retry logic eventually succeeds or exhausts attempts
- Coverage calculation is always between 0-100%
- PR body always includes required sections
- Branch validation always checks all required files

### Lambda Function Tests

**Work Item Poller Tests**:
- Test polling with no work items available
- Test polling with multiple work items (selects oldest/highest priority)
- Test lock acquisition success and failure
- Test CodeBuild trigger with correct parameters
- Test error handling for GitHub API failures
- Test error handling for DynamoDB failures
- Test timeout handling and cleanup

**State Manager Tests**:
- Test lock acquisition with no existing lock
- Test lock acquisition with expired lock
- Test lock acquisition with active lock (should fail)
- Test lock release with valid lockId
- Test lock release with invalid lockId
- Test stale work detection and cleanup

## Performance Considerations

### Build Time Optimization

**Target**: Complete execution in < 15 minutes for typical tasks

**Optimization Strategies**:
- Parallel test execution (if supported by test framework)
- Incremental builds (cache dependencies)
- Shallow git clones
- Compressed artifact uploads

### Resource Limits

**CodeBuild Compute**:
- Small: 3 GB memory, 2 vCPUs (default)
- Medium: 7 GB memory, 4 vCPUs (for large projects)
- Large: 15 GB memory, 8 vCPUs (for very large projects)

**Timeout Limits**:
- Default: 60 minutes
- Maximum: 480 minutes (8 hours)
- Recommended: 30 minutes for most tasks

### Concurrent Execution

**Limits**:
- Maximum concurrent builds per project: 100 (AWS default)
- Maximum concurrent builds per account: 60 (AWS default)
- Request limit increases if needed

**Isolation**:
- Each build runs in isolated container
- Unique feature branches prevent conflicts
- No shared state between builds

## Future Enhancements

### Phase 2 Features

1. **Multi-Task Execution**: Execute multiple spec tasks in single build
2. **Incremental Testing**: Run only tests affected by changes
3. **Parallel Environment Deployment**: Deploy to multiple environments simultaneously
4. **Advanced Retry Logic**: Intelligent retry based on error type
5. **Build Caching**: Cache dependencies and build artifacts
6. **Priority-Based Work Processing**: Process high-priority work items first
7. **Work Item Status Updates**: Update GitHub Project item status automatically

### Phase 3 Features

1. **Self-Healing**: Automatically fix common issues (formatting, linting)
2. **Performance Profiling**: Track and optimize build performance
3. **Cost Optimization**: Analyze and reduce AWS costs
4. **Advanced Monitoring**: ML-based anomaly detection
5. **Multi-Repository Support**: Coordinate changes across multiple repos
6. **Parallel Work Processing**: Process multiple work items concurrently with resource limits
7. **Work Item Comments**: Post build status and results as comments on work items

## Design Document Change Summary

### Major Changes from Previous Version

**1. Work Item Model Changed** (Requirement 1)
- **Previous**: Workers created new feature branches with unique names
- **Current**: Workers operate on existing feature branches that already contain spec files
- **Impact**: Removed branch creation logic, added branch and spec validation logic
- **Note**: Requirement 8 (Work Isolation) is now achieved through DynamoDB locking (Requirement 19) rather than unique branch names, as workers process one work item at a time sequentially

**2. GitHub Projects Integration Added** (Requirements 17, 18, 19)
- **New Component**: GitHub Project Monitor to query work items from GitHub Projects
- **New Component**: Work Item Poller Lambda function for scheduled polling
- **New Component**: Work Item State Manager for concurrency control with DynamoDB
- **Architecture**: Added EventBridge scheduled rule → Lambda → CodeBuild trigger flow
- **Impact**: Complete work item discovery and triggering system

**3. Concurrency Control Added** (Requirement 19)
- **New**: DynamoDB-based distributed locking mechanism
- **New**: Single work item execution guarantee
- **New**: Stale work detection and recovery
- **Impact**: Ensures only one work item processes at a time

**4. Infrastructure Stacks Reorganized**
- **Added**: Stack 3 (Work Item Poller) before CodeBuild stack
- **Modified**: Stack 1 now includes DynamoDB table
- **Modified**: Stack 2 includes GitHub Project configuration
- **Impact**: Deployment sequence updated, new IAM permissions required

**5. Configuration Management Enhanced**
- **Added**: GitHub Project configuration parameters
- **Added**: Branch name and spec path passed from poller to CodeBuild
- **Impact**: buildspec.yml updated with new environment variables

**6. IAM Permissions Expanded**
- **Added**: Lambda execution permissions for poller
- **Added**: DynamoDB permissions for lock management
- **Added**: EventBridge permissions for scheduled rules
- **Added**: SQS permissions for dead letter queue
- **Impact**: Deployment and runtime IAM policies updated

**7. Workflow Documentation Added**
- **New**: Complete end-to-end workflow with all phases
- **New**: Error recovery scenarios for new components
- **Impact**: Better understanding of system behavior

**8. Testing Strategy Expanded**
- **Added**: Tests for GitHub Project Monitor
- **Added**: Tests for Work Item Poller
- **Added**: Tests for Work Item State Manager
- **Added**: Property-based tests for lock exclusivity
- **Added**: Tests for PR validation and error handling
- **Impact**: More comprehensive test coverage requirements

**9. Component Naming Clarification**
- **Renamed**: Pull Request Creator → Pull Request Updater
- **Rationale**: Better reflects that component updates existing PRs rather than creating new ones
- **Impact**: Clearer alignment with existing branch/PR model (Requirements 1, 2)

## Appendix

### Glossary Reference

See requirements document for complete glossary of terms.

### Related Documentation

- AWS CodeBuild Documentation
- Kiro CLI Documentation
- GitHub API Documentation
- GitLab API Documentation
- AWS Secrets Manager Best Practices

### Change Log

- v1.0.0 (2026-01-25): Initial design document
- v1.1.0 (2026-01-25): Enhanced deployment architecture with:
  - Comprehensive deployment documentation structure
  - Pre-deployment permission validation design
  - Automated deployment scripts and tooling
  - Detailed validation procedures
- v2.0.0 (2026-01-25): Major architecture update to align with updated requirements:
  - Changed from branch creation to existing branch model (Requirement 1)
  - Added GitHub Projects integration for work item discovery (Requirement 17)
  - Added scheduled work item polling with EventBridge and Lambda (Requirement 18)
  - Added DynamoDB-based concurrency control for single work item execution (Requirement 19)
  - Added three new components: GitHub Project Monitor, Work Item Poller, Work Item State Manager
  - Updated architecture diagram to show complete workflow
  - Reorganized infrastructure stacks to include Lambda and DynamoDB
  - Expanded IAM permissions for new components
  - Added comprehensive workflow documentation with error recovery scenarios
  - Updated testing strategy for new components
- v2.1.0 (2026-01-25): Refinements to align with existing branch model:
  - Updated Git Branch Manager to validate pull request existence
  - Changed Pull Request Creator to update existing PRs rather than create new ones
  - Added Decision 11 about PR updates vs creation
  - Clarified that Requirement 8 (Work Isolation) is now achieved through DynamoDB locking
  - Removed branch naming patterns from environment-specific behavior
  - Enhanced validation logic to ensure consistency between work items, branches, spec folders, and PRs
- v2.2.0 (2026-01-25): Component naming and validation refinements:
  - Renamed "Pull Request Creator" to "Pull Request Updater" throughout document for clarity
  - Enhanced PR validation to fail build if PR doesn't exist (aligns with Requirement 1)
  - Added error scenario for missing PR (Scenario 6)
  - Updated integration test scenarios to include PR validation testing
  - Clarified PR update behavior in workflow documentation
