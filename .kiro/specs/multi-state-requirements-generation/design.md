# Design Document: Multi-State Requirements Generation

## Overview

This design document describes the architecture and implementation approach for enhancing the Kiro CodeBuild Worker to support multi-state monitoring and automated requirements generation. The system will monitor GitHub project work items across multiple configurable states, route them to appropriate workflows, and automatically generate requirements specifications when tickets move to "Build Requirements" status.

The design maintains backward compatibility with the existing "For Implementation" workflow while introducing a flexible, extensible architecture for state-based workflow routing.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EventBridge Scheduled Rule                    │
│                    (Every N minutes)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Work Item Poller Lambda                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  GitHub Project Monitor (Enhanced)                        │  │
│  │  - Query multiple states                                  │  │
│  │  - Return work items with state information              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    State Router (New)                            │
│  - Map work item state to workflow                              │
│  - Load configuration                                            │
│  - Trigger appropriate CodeBuild project                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
┌───────────────────────────┐  ┌──────────────────────────────┐
│ Requirements Generation   │  │ Implementation Workflow      │
│ CodeBuild Project (New)   │  │ CodeBuild Project (Existing) │
└───────────────────────────┘  └──────────────────────────────┘
```


### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Configuration Layer                           │
│  - WorkflowConfiguration                                         │
│  - StateToWorkflowMapping                                        │
│  - MonitoredStates                                               │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestration Layer                           │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ State Router     │  │ Workflow Factory │                    │
│  │ (New)            │  │ (New)            │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
┌───────────────────────────┐  ┌──────────────────────────────┐
│ Requirements Workflow     │  │ Implementation Workflow      │
│ (New)                     │  │ (Existing)                   │
│                           │  │                              │
│ - Requirements Generator  │  │ - Git Branch Manager         │
│ - Branch Creator          │  │ - Steering Synchronizer      │
│ - Spec Folder Manager     │  │ - Kiro CLI Executor          │
│ - PR Creator              │  │ - Test Runner                │
│ - State Updater           │  │ - PR Updater                 │
└───────────────────────────┘  └──────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Shared Services Layer                         │
│  - Work Item State Manager (DynamoDB Locking)                   │
│  - GitHub API Client                                             │
│  - Git Operations                                                │
│  - Error Handler with Retry Logic                               │
└─────────────────────────────────────────────────────────────────┘
```


## Components and Interfaces

### 1. WorkflowConfiguration

**Purpose**: Manages configuration for state-to-workflow mappings and monitored states.

**Interface**:
```typescript
interface WorkflowConfig {
  monitoredStates: string[];
  stateWorkflowMap: Record<string, WorkflowType>;
  nextStateMap: Record<string, string>;
  environment: 'test' | 'staging' | 'production';
}

enum WorkflowType {
  REQUIREMENTS_GENERATION = 'requirements-generation',
  IMPLEMENTATION = 'implementation',
  MONITORING = 'monitoring',
  REVIEW = 'review'
}

class WorkflowConfiguration {
  private config: WorkflowConfig;
  
  constructor(environment: string);
  loadConfiguration(): Promise<WorkflowConfig>;
  getMonitoredStates(): string[];
  getWorkflowForState(state: string): WorkflowType | null;
  getNextState(currentState: string): string | null;
  validateConfiguration(): boolean;
}
```

**Responsibilities**:
- Load configuration from environment variables or configuration files
- Provide state-to-workflow mappings
- Validate configuration on startup
- Support environment-specific configurations


### 2. Enhanced GitHub Project Monitor

**Purpose**: Query GitHub Projects for work items across multiple states.

**Interface**:
```typescript
interface WorkItem {
  id: string;
  title: string;
  description: string;
  state: string;
  branchName?: string;
  pullRequestUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

class GitHubProjectMonitor {
  constructor(
    private readonly githubClient: Octokit,
    private readonly projectConfig: ProjectConfig
  );
  
  async queryWorkItems(states: string[]): Promise<WorkItem[]>;
  async updateWorkItemState(workItemId: string, newState: string): Promise<void>;
  async updateWorkItemField(workItemId: string, field: string, value: string): Promise<void>;
}
```

**Changes from Existing**:
- Accept array of states instead of single state
- Include state information in returned work items
- Add method to update work item state


### 3. State Router

**Purpose**: Route work items to appropriate workflows based on their state.

**Interface**:
```typescript
interface RoutingDecision {
  workflowType: WorkflowType;
  codeBuildProject: string;
  environmentVariables: Record<string, string>;
}

class StateRouter {
  constructor(
    private readonly config: WorkflowConfiguration,
    private readonly codeBuildClient: CodeBuildClient
  );
  
  async routeWorkItem(workItem: WorkItem): Promise<RoutingDecision>;
  async triggerWorkflow(workItem: WorkItem, decision: RoutingDecision): Promise<string>;
  private determineWorkflow(state: string): WorkflowType | null;
  private buildEnvironmentVariables(workItem: WorkItem, workflow: WorkflowType): Record<string, string>;
}
```

**Responsibilities**:
- Determine appropriate workflow for work item state
- Build CodeBuild environment variables
- Trigger CodeBuild project with work item details
- Handle routing errors gracefully


### 4. Requirements Generator

**Purpose**: Analyze work items and generate structured requirements.md files.

**Interface**:
```typescript
interface RequirementsAnalysis {
  userStories: UserStory[];
  glossaryTerms: GlossaryTerm[];
  technicalConstraints: string[];
}

interface UserStory {
  role: string;
  feature: string;
  benefit: string;
  acceptanceCriteria: AcceptanceCriterion[];
}

interface AcceptanceCriterion {
  pattern: EARSPattern;
  statement: string;
}

enum EARSPattern {
  UBIQUITOUS = 'ubiquitous',
  EVENT_DRIVEN = 'event-driven',
  STATE_DRIVEN = 'state-driven',
  UNWANTED_EVENT = 'unwanted-event',
  OPTIONAL_FEATURE = 'optional-feature',
  COMPLEX = 'complex'
}

class RequirementsGenerator {
  constructor(private readonly aiClient: AIClient);
  
  async analyzeWorkItem(workItem: WorkItem): Promise<RequirementsAnalysis>;
  async generateRequirementsDocument(analysis: RequirementsAnalysis, workItem: WorkItem): Promise<string>;
  private extractUserStories(description: string): UserStory[];
  private extractGlossaryTerms(description: string): GlossaryTerm[];
  private formatWithEARSPattern(criterion: string): AcceptanceCriterion;
}
```

**Responsibilities**:
- Parse work item title and description
- Extract user stories and acceptance criteria
- Identify technical terms for glossary
- Format requirements using EARS patterns
- Generate complete requirements.md content


### 5. Branch and Spec Manager

**Purpose**: Create branches and manage spec folder structure.

**Interface**:
```typescript
interface BranchInfo {
  name: string;
  exists: boolean;
  specFolderPath: string;
}

class BranchAndSpecManager {
  constructor(
    private readonly git: SimpleGit,
    private readonly repoPath: string
  );
  
  async ensureBranchExists(workItem: WorkItem): Promise<BranchInfo>;
  async createBranch(branchName: string): Promise<void>;
  async ensureSpecFolder(branchName: string): Promise<string>;
  async writeRequirementsFile(specPath: string, content: string): Promise<void>;
  async commitChanges(message: string): Promise<void>;
  async pushBranch(branchName: string): Promise<void>;
  private generateBranchName(title: string): string;
}
```

**Responsibilities**:
- Generate branch names from work item titles (kebab-case)
- Create branches if they don't exist
- Ensure .kiro/specs/{branch-name}/ directory exists
- Write requirements.md file
- Commit and push changes


### 6. Pull Request Manager

**Purpose**: Create and update pull requests for requirements review.

**Interface**:
```typescript
interface PullRequestInfo {
  url: string;
  number: number;
  state: 'open' | 'closed' | 'merged';
}

class PullRequestManager {
  constructor(
    private readonly githubClient: Octokit,
    private readonly repoOwner: string,
    private readonly repoName: string
  );
  
  async createOrUpdatePullRequest(
    branchName: string,
    workItem: WorkItem,
    requirementsPath: string
  ): Promise<PullRequestInfo>;
  
  async findExistingPullRequest(branchName: string): Promise<PullRequestInfo | null>;
  private buildPullRequestBody(workItem: WorkItem, requirementsPath: string): string;
}
```

**Responsibilities**:
- Check if pull request already exists for branch
- Create new pull request or update existing one
- Set PR title and body with work item details
- Return PR URL for updating work item


### 7. Requirements Generation Workflow

**Purpose**: Orchestrate the complete requirements generation process.

**Interface**:
```typescript
interface WorkflowResult {
  success: boolean;
  branchName: string;
  requirementsPath: string;
  pullRequestUrl?: string;
  error?: Error;
}

class RequirementsGenerationWorkflow {
  constructor(
    private readonly requirementsGenerator: RequirementsGenerator,
    private readonly branchManager: BranchAndSpecManager,
    private readonly prManager: PullRequestManager,
    private readonly githubMonitor: GitHubProjectMonitor,
    private readonly config: WorkflowConfiguration
  );
  
  async execute(workItem: WorkItem): Promise<WorkflowResult>;
  private async generateRequirements(workItem: WorkItem): Promise<string>;
  private async setupBranchAndFolder(workItem: WorkItem): Promise<BranchInfo>;
  private async commitAndPush(branchInfo: BranchInfo, content: string): Promise<void>;
  private async createPullRequest(branchInfo: BranchInfo, workItem: WorkItem): Promise<string>;
  private async updateWorkItemState(workItem: WorkItem): Promise<void>;
}
```

**Workflow Steps**:
1. Analyze work item and generate requirements
2. Ensure branch exists (create if needed)
3. Ensure spec folder exists
4. Write requirements.md file
5. Commit and push changes
6. Create or update pull request
7. Update work item state to next state
8. Update work item with PR URL


### 8. Workflow Factory

**Purpose**: Create appropriate workflow instances based on workflow type.

**Interface**:
```typescript
interface Workflow {
  execute(workItem: WorkItem): Promise<WorkflowResult>;
}

class WorkflowFactory {
  constructor(
    private readonly config: WorkflowConfiguration,
    private readonly dependencies: WorkflowDependencies
  );
  
  createWorkflow(workflowType: WorkflowType): Workflow;
  private createRequirementsWorkflow(): RequirementsGenerationWorkflow;
  private createImplementationWorkflow(): ImplementationWorkflow;
}
```

**Responsibilities**:
- Instantiate workflow objects with proper dependencies
- Provide factory method for workflow creation
- Manage workflow lifecycle


## Data Models

### WorkflowConfig

```typescript
interface WorkflowConfig {
  // List of states to monitor
  monitoredStates: string[];
  
  // Map state to workflow type
  stateWorkflowMap: Record<string, WorkflowType>;
  
  // Map current state to next state after workflow completion
  nextStateMap: Record<string, string>;
  
  // Environment
  environment: 'test' | 'staging' | 'production';
  
  // CodeBuild project names for each workflow
  codeBuildProjects: Record<WorkflowType, string>;
}
```

**Example Configuration**:
```json
{
  "monitoredStates": ["Build Requirements", "For Implementation", "In Progress"],
  "stateWorkflowMap": {
    "Build Requirements": "requirements-generation",
    "For Implementation": "implementation"
  },
  "nextStateMap": {
    "Build Requirements": "Requirements Review",
    "For Implementation": "In Progress"
  },
  "environment": "production",
  "codeBuildProjects": {
    "requirements-generation": "kiro-worker-prod-requirements",
    "implementation": "kiro-worker-prod"
  }
}
```


### WorkItem

```typescript
interface WorkItem {
  // Unique identifier
  id: string;
  
  // Work item title
  title: string;
  
  // Detailed description
  description: string;
  
  // Current state/status
  state: string;
  
  // Git branch name (may not exist yet)
  branchName?: string;
  
  // Pull request URL (may not exist yet)
  pullRequestUrl?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Additional metadata
  labels?: string[];
  assignees?: string[];
}
```

### RequirementsAnalysis

```typescript
interface RequirementsAnalysis {
  // Extracted user stories
  userStories: UserStory[];
  
  // Technical terms for glossary
  glossaryTerms: GlossaryTerm[];
  
  // Technical constraints identified
  technicalConstraints: string[];
  
  // Introduction summary
  introduction: string;
}

interface UserStory {
  // User role
  role: string;
  
  // Feature description
  feature: string;
  
  // Benefit/value
  benefit: string;
  
  // Acceptance criteria
  acceptanceCriteria: AcceptanceCriterion[];
}

interface AcceptanceCriterion {
  // EARS pattern type
  pattern: EARSPattern;
  
  // Formatted statement
  statement: string;
  
  // Original text
  originalText: string;
}

interface GlossaryTerm {
  // Term name
  term: string;
  
  // Definition
  definition: string;
}
```


### BranchInfo

```typescript
interface BranchInfo {
  // Branch name in kebab-case
  name: string;
  
  // Whether branch already exists
  exists: boolean;
  
  // Path to spec folder
  specFolderPath: string;
  
  // Whether spec folder was created
  specFolderCreated: boolean;
}
```

### WorkflowResult

```typescript
interface WorkflowResult {
  // Whether workflow succeeded
  success: boolean;
  
  // Branch name used
  branchName: string;
  
  // Path to requirements file
  requirementsPath?: string;
  
  // Pull request URL
  pullRequestUrl?: string;
  
  // Error if failed
  error?: Error;
  
  // Workflow execution duration
  durationMs: number;
  
  // Workflow type executed
  workflowType: WorkflowType;
}
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection

After analyzing all acceptance criteria, I identified several redundancies:
- Properties 3.3 and 3.4 both test requirements file format compliance - combined into one property
- Properties 1.1 and 1.2 both test multi-state querying - combined into comprehensive property
- Properties 9.1 and 9.4 both test lock acquisition - combined to test lock acquisition with proper key structure

### Multi-State Monitoring Properties

**Property 1: Multi-state query completeness**
*For any* configuration with multiple monitored states, when the GitHub Project Monitor queries work items, all returned work items SHALL have states that are in the configured monitored states list, and work items from all configured states SHALL be included in results.
**Validates: Requirements 1.1, 1.2**

**Property 2: Work item state inclusion**
*For any* work item retrieved by the system, the work item data SHALL include a non-empty state field.
**Validates: Requirements 1.3**

**Property 3: Configuration hot-reload**
*For any* configuration update adding new monitored states, the next polling cycle SHALL query work items in the updated state list without requiring system restart.
**Validates: Requirements 1.5, 8.5**


### State Routing Properties

**Property 4: State-to-workflow routing correctness**
*For any* work item with a state that has a configured workflow mapping, the State Router SHALL route the work item to the correct workflow type as defined in the configuration.
**Validates: Requirements 2.1**

**Property 5: Unmapped state handling**
*For any* work item with a state that has no configured workflow mapping, the System SHALL skip the work item and log a warning without throwing an error.
**Validates: Requirements 2.4**

### Requirements Generation Properties

**Property 6: Requirements analysis completeness**
*For any* work item in "Build Requirements" state, the Requirements Generator SHALL produce an analysis containing user stories, glossary terms, and technical constraints sections.
**Validates: Requirements 3.1, 3.2**

**Property 7: Requirements document format compliance**
*For any* generated requirements.md file, the file SHALL contain Introduction, Glossary, and Requirements sections with properly formatted user stories and acceptance criteria.
**Validates: Requirements 3.3, 3.4**

**Property 8: Requirements commit verification**
*For any* successfully generated requirements document, the System SHALL create a commit containing the requirements.md file in the work item branch.
**Validates: Requirements 3.5**

**Property 9: EARS pattern compliance**
*For any* generated acceptance criterion, the criterion SHALL be formatted using one of the valid EARS patterns (Ubiquitous, Event-driven, State-driven, Unwanted event, Optional feature, or Complex).
**Validates: Requirements 7.4**


### Branch and Spec Management Properties

**Property 10: Branch creation for non-existent branches**
*For any* work item in "Build Requirements" state with a non-existent branch, the System SHALL create a new branch before proceeding with requirements generation.
**Validates: Requirements 4.1**

**Property 11: Branch name format compliance**
*For any* work item title, the generated branch name SHALL be in valid kebab-case format (lowercase letters, numbers, and hyphens only).
**Validates: Requirements 4.2**

**Property 12: Spec folder existence guarantee**
*For any* work item processed in "Build Requirements" state, after workflow completion, the .kiro/specs/{branch-name}/ directory SHALL exist.
**Validates: Requirements 4.3**

**Property 13: Implementation workflow validation**
*For any* work item in "For Implementation" state, if the branch, spec folder, or pull request does not exist, the System SHALL fail validation and skip the work item with an error log.
**Validates: Requirements 4.4, 4.5**

### Pull Request Management Properties

**Property 14: Pull request creation after commit**
*For any* work item where requirements.md is successfully committed, a pull request SHALL exist for the branch (either newly created or previously existing).
**Validates: Requirements 5.1**

**Property 15: Pull request title accuracy**
*For any* created or updated pull request, the PR title SHALL match the work item title exactly.
**Validates: Requirements 5.2**

**Property 16: Pull request body completeness**
*For any* created or updated pull request, the PR body SHALL contain the work item description and a link to the generated requirements file.
**Validates: Requirements 5.3**

**Property 17: Work item PR URL update**
*For any* successfully created pull request, the work item SHALL be updated with the pull request URL.
**Validates: Requirements 5.4**

**Property 18: Pull request idempotency**
*For any* branch with an existing pull request, running the requirements generation workflow again SHALL update the existing PR rather than creating a duplicate.
**Validates: Requirements 5.5**


### State Transition Properties

**Property 19: Successful workflow state transition**
*For any* work item where the workflow completes successfully and a next state is configured, the work item state SHALL be updated to the configured next state via the GitHub Projects API.
**Validates: Requirements 6.1, 6.3**

**Property 20: State transition failure resilience**
*For any* work item where state transition fails, the System SHALL log an error but SHALL NOT fail the entire workflow, allowing the workflow to complete successfully.
**Validates: Requirements 6.4**

**Property 21: No-op state transition**
*For any* workflow where no next state is configured, the work item state SHALL remain unchanged after workflow completion.
**Validates: Requirements 6.5**

### Configuration Management Properties

**Property 22: Configuration loading from multiple sources**
*For any* environment, the System SHALL successfully load workflow configuration from either configuration files or environment variables.
**Validates: Requirements 8.1**

**Property 23: Environment-specific configuration**
*For any* environment (test, staging, production), the System SHALL load and apply the configuration specific to that environment.
**Validates: Requirements 8.2**

**Property 24: Configuration fallback behavior**
*For any* invalid or missing configuration, the System SHALL use default values, log a warning, and continue operation without crashing.
**Validates: Requirements 8.3**


### Concurrency Control Properties

**Property 25: Lock acquisition with proper key structure**
*For any* work item being processed, the System SHALL acquire a DynamoDB lock before starting the workflow, and the lock key SHALL include both the work item ID and workflow type.
**Validates: Requirements 9.1, 9.4**

**Property 26: Lock contention handling**
*For any* work item where lock acquisition fails, the System SHALL skip that work item and proceed to the next work item without error.
**Validates: Requirements 9.2**

**Property 27: Lock cleanup guarantee**
*For any* workflow execution (successful or failed), the System SHALL release the DynamoDB lock after workflow completion.
**Validates: Requirements 9.3**

**Property 28: Lock expiration and reacquisition**
*For any* lock that expires due to timeout, another process SHALL be able to acquire the lock for the same work item.
**Validates: Requirements 9.5**

### Error Handling Properties

**Property 29: Work item validation and skipping**
*For any* work item missing required fields for its workflow, the System SHALL log a validation error and skip the work item without processing.
**Validates: Requirements 10.1**

**Property 30: Retry with exponential backoff**
*For any* requirements generation failure, the System SHALL retry the operation with exponential backoff up to 3 attempts before giving up.
**Validates: Requirements 10.2, 10.4**

**Property 31: Final failure handling**
*For any* operation that fails after all retry attempts, the System SHALL log the error, release the lock, and continue processing the next work item.
**Validates: Requirements 10.3**

**Property 32: Error message completeness**
*For any* error that occurs during workflow execution, the error message SHALL include the work item ID, state, and workflow type.
**Validates: Requirements 10.5**


### Monitoring and Observability Properties

**Property 33: Workflow start logging**
*For any* workflow execution, when the workflow starts, the System SHALL log the work item ID, state, and workflow type.
**Validates: Requirements 11.1**

**Property 34: Workflow completion logging**
*For any* workflow execution, when the workflow completes, the System SHALL log the duration and outcome (success or failure).
**Validates: Requirements 11.2**

**Property 35: CloudWatch metrics emission**
*For any* workflow execution, the System SHALL emit CloudWatch metrics including workflow type, success/failure status, and duration.
**Validates: Requirements 11.3**

**Property 36: Requirements generation metrics**
*For any* successful requirements generation, the System SHALL log the number of requirements and acceptance criteria generated.
**Validates: Requirements 11.4**

### Backward Compatibility Properties

**Property 37: Implementation workflow preservation**
*For any* work item in "For Implementation" state, the System SHALL execute the existing implementation workflow with all existing components (GitBranchManager, SteeringSynchronizer, KiroCliExecutor, TestRunner, PullRequestUpdater) functioning unchanged.
**Validates: Requirements 12.1**

**Property 38: Default workflow fallback**
*For any* system deployment where no state-to-workflow configuration exists, the System SHALL default to processing work items in "For Implementation" state using the existing implementation workflow.
**Validates: Requirements 12.3**

**Property 39: Cross-workflow lock compatibility**
*For any* workflow type (requirements generation or implementation), the DynamoDB lock mechanism SHALL function correctly and prevent concurrent processing of the same work item.
**Validates: Requirements 12.4**


## Error Handling

### Error Categories

**1. Configuration Errors**
- Invalid or missing configuration files
- Malformed state-to-workflow mappings
- Missing required environment variables

**Handling**: Use default values, log warnings, continue operation

**2. Work Item Validation Errors**
- Missing required fields (title, description, state)
- Invalid state values
- Malformed work item data

**Handling**: Log validation error, skip work item, continue to next

**3. GitHub API Errors**
- Rate limiting (429)
- Authentication failures (401, 403)
- Network timeouts
- API unavailability (5xx)

**Handling**: Retry with exponential backoff (max 3 attempts), log error if all retries fail

**4. Git Operation Errors**
- Branch creation failures
- Commit failures
- Push failures (conflicts, permissions)

**Handling**: Retry with exponential backoff, release lock, log error

**5. Requirements Generation Errors**
- AI/LLM service unavailable
- Invalid analysis output
- Template rendering failures

**Handling**: Retry with exponential backoff (max 3 attempts), log error, skip work item

**6. Lock Acquisition Errors**
- Lock already held by another process
- DynamoDB unavailable
- Lock timeout

**Handling**: Skip work item, try next work item, log info message


### Retry Strategy

**Exponential Backoff Configuration**:
```typescript
interface RetryConfig {
  maxAttempts: 3;
  initialDelayMs: 1000;
  maxDelayMs: 10000;
  backoffMultiplier: 2;
}
```

**Retry Logic**:
```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelayMs;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxAttempts) {
        throw lastError;
      }
      
      if (!isRetryableError(error)) {
        throw error;
      }
      
      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }
  
  throw lastError!;
}
```

**Retryable Errors**:
- Network timeouts
- HTTP 429 (rate limiting)
- HTTP 5xx (server errors)
- Transient DynamoDB errors
- Git push conflicts (after pull)

**Non-Retryable Errors**:
- HTTP 401/403 (authentication/authorization)
- HTTP 400 (bad request)
- Validation errors
- Configuration errors


### Custom Error Classes

```typescript
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly workItemId: string,
    public readonly state: string,
    public readonly workflowType: WorkflowType,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly configKey: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class RequirementsGenerationError extends WorkflowError {
  constructor(
    message: string,
    workItemId: string,
    state: string,
    public readonly analysisStage: string,
    cause?: Error
  ) {
    super(message, workItemId, state, WorkflowType.REQUIREMENTS_GENERATION, cause);
    this.name = 'RequirementsGenerationError';
  }
}

export class LockAcquisitionError extends Error {
  constructor(
    message: string,
    public readonly lockKey: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LockAcquisitionError';
  }
}
```


## Testing Strategy

### Dual Testing Approach

The testing strategy employs both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit Tests**: Verify specific examples, edge cases, and error conditions
- **Property Tests**: Verify universal properties across all inputs using fast-check
- Both approaches are complementary and necessary for ≥80% code coverage

### Unit Testing

**Test Organization**:
```
src/
├── components/
│   ├── workflow-configuration.ts
│   ├── workflow-configuration.test.ts
│   ├── state-router.ts
│   ├── state-router.test.ts
│   ├── requirements-generator.ts
│   ├── requirements-generator.test.ts
│   ├── branch-and-spec-manager.ts
│   ├── branch-and-spec-manager.test.ts
│   ├── pull-request-manager.ts
│   ├── pull-request-manager.test.ts
│   ├── requirements-generation-workflow.ts
│   └── requirements-generation-workflow.test.ts
```

**Unit Test Coverage**:
- Happy path scenarios for each component
- Error conditions and exception handling
- Edge cases (empty inputs, null values, boundary conditions)
- Integration points between components
- Mock external dependencies (GitHub API, Git operations, DynamoDB)

**Example Unit Test**:
```typescript
describe('StateRouter', () => {
  let router: StateRouter;
  let mockConfig: WorkflowConfiguration;
  let mockCodeBuild: CodeBuildClient;
  
  beforeEach(() => {
    mockConfig = createMockConfig();
    mockCodeBuild = createMockCodeBuildClient();
    router = new StateRouter(mockConfig, mockCodeBuild);
  });
  
  it('should route Build Requirements state to requirements workflow', async () => {
    const workItem = createMockWorkItem({ state: 'Build Requirements' });
    const decision = await router.routeWorkItem(workItem);
    
    expect(decision.workflowType).toBe(WorkflowType.REQUIREMENTS_GENERATION);
  });
  
  it('should skip work item with unmapped state', async () => {
    const workItem = createMockWorkItem({ state: 'Unknown State' });
    const decision = await router.routeWorkItem(workItem);
    
    expect(decision).toBeNull();
  });
});
```


### Property-Based Testing

**Framework**: fast-check (TypeScript property-based testing library)

**Configuration**: Minimum 100 iterations per property test

**Property Test Examples**:

```typescript
import * as fc from 'fast-check';

describe('Property Tests: Branch Name Generation', () => {
  it('Property 11: Branch names are always valid kebab-case', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (title) => {
          const branchName = generateBranchName(title);
          // Must match kebab-case pattern
          return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(branchName);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property Tests: State Routing', () => {
  it('Property 4: State routing is deterministic', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          title: fc.string(),
          description: fc.string(),
          state: fc.constantFrom('Build Requirements', 'For Implementation', 'In Progress'),
          createdAt: fc.date(),
          updatedAt: fc.date()
        }),
        async (workItem) => {
          const decision1 = await router.routeWorkItem(workItem);
          const decision2 = await router.routeWorkItem(workItem);
          
          // Same work item should always route to same workflow
          return decision1.workflowType === decision2.workflowType;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property Tests: Lock Management', () => {
  it('Property 27: Locks are always released after workflow', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          title: fc.string(),
          description: fc.string(),
          state: fc.constant('Build Requirements'),
          createdAt: fc.date(),
          updatedAt: fc.date()
        }),
        fc.boolean(), // simulate success or failure
        async (workItem, shouldSucceed) => {
          const lockKey = `${workItem.id}-requirements-generation`;
          
          try {
            if (shouldSucceed) {
              await workflow.execute(workItem);
            } else {
              await workflow.execute(workItem).catch(() => {});
            }
          } finally {
            // Lock should be released regardless of success/failure
            const lockExists = await lockManager.isLocked(lockKey);
            return !lockExists;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```


### Integration Testing

**Integration Test Scenarios**:

1. **End-to-End Requirements Generation**:
   - Create test work item in "Build Requirements" state
   - Trigger workflow
   - Verify branch created
   - Verify spec folder created
   - Verify requirements.md file exists with correct content
   - Verify pull request created
   - Verify work item state updated

2. **Multi-State Polling**:
   - Configure multiple monitored states
   - Create work items in different states
   - Trigger poller
   - Verify all states are queried
   - Verify correct workflows triggered

3. **Backward Compatibility**:
   - Create work item in "For Implementation" state
   - Trigger workflow
   - Verify existing implementation workflow executes
   - Verify all existing components function correctly

4. **Lock Contention**:
   - Simulate concurrent processing attempts
   - Verify only one process acquires lock
   - Verify other processes skip work item
   - Verify lock is released after completion

**Integration Test Setup**:
```typescript
describe('Integration: Requirements Generation Workflow', () => {
  let testRepo: string;
  let githubClient: Octokit;
  let workflow: RequirementsGenerationWorkflow;
  
  beforeAll(async () => {
    testRepo = await createTestRepository();
    githubClient = createTestGitHubClient();
    workflow = createWorkflowWithRealDependencies();
  });
  
  afterAll(async () => {
    await cleanupTestRepository(testRepo);
  });
  
  it('should generate requirements end-to-end', async () => {
    const workItem = createTestWorkItem({
      state: 'Build Requirements',
      title: 'Add user authentication',
      description: 'As a user, I want to log in...'
    });
    
    const result = await workflow.execute(workItem);
    
    expect(result.success).toBe(true);
    expect(result.branchName).toMatch(/^[a-z0-9-]+$/);
    expect(result.pullRequestUrl).toBeDefined();
    
    // Verify files exist
    const requirementsPath = `${testRepo}/.kiro/specs/${result.branchName}/requirements.md`;
    expect(await fileExists(requirementsPath)).toBe(true);
    
    // Verify content
    const content = await readFile(requirementsPath);
    expect(content).toContain('# Requirements Document');
    expect(content).toContain('## Glossary');
    expect(content).toContain('## Requirements');
  });
});
```


### Test Coverage Requirements

**Minimum Coverage**: 80% for all metrics (lines, functions, branches, statements)

**Coverage by Component**:
- WorkflowConfiguration: ≥80%
- StateRouter: ≥80%
- RequirementsGenerator: ≥80%
- BranchAndSpecManager: ≥80%
- PullRequestManager: ≥80%
- RequirementsGenerationWorkflow: ≥80%
- WorkflowFactory: ≥80%
- Enhanced GitHubProjectMonitor: ≥80%

**Property Test Tagging**:
Each property test must include a comment tag referencing the design property:
```typescript
// Feature: multi-state-requirements-generation, Property 11: Branch name format compliance
it('should generate valid kebab-case branch names', () => {
  fc.assert(fc.property(...));
});
```

**Test Execution**:
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run property tests only
npm test -- --grep "Property"

# Run integration tests only
npm test -- --grep "Integration"
```

**CI/CD Integration**:
- All tests must pass before merge
- Coverage must be ≥80% before merge
- Property tests run with 100 iterations in CI
- Integration tests run against test environment

