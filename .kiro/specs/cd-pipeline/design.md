# CD Pipeline with Automated Deployment and Rollback - Design Document

## 1. Feature Overview

This design implements a continuous deployment (CD) pipeline using AWS CodePipeline that automatically deploys infrastructure and application changes from the main branch to multiple environments (test, staging, production). The pipeline includes comprehensive testing, security scanning, monitoring integration, and automated rollback capabilities to ensure reliable deployments.

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GitHub Repository                               │
│                         (main branch push)                               │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AWS CodePipeline                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Source  │─▶│  Build   │─▶│   Test   │─▶│ Staging  │─▶│   Prod   │ │
│  │  Stage   │  │  Stage   │  │   Env    │  │   Env    │  │   Env    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│       │             │             │             │             │         │
│       │             │             │             │             │         │
│       ▼             ▼             ▼             ▼             ▼         │
│  GitHub      Unit Tests    Integration   E2E Tests    Manual Approval  │
│  Webhook     Security      Tests         Health       Production       │
│              Scanning      Coverage      Checks       Deployment       │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Monitoring & Rollback System                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  CloudWatch  │─▶│  EventBridge │─▶│   Rollback   │                 │
│  │    Alarms    │  │    Rules     │  │   Lambda     │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Architecture


**Pipeline Stages:**

1. **Source Stage**: GitHub webhook triggers pipeline on main branch push
2. **Build Stage**: Compile TypeScript, run linting, security scanning
3. **Test Environment Stage**: Deploy infrastructure + application, run integration tests
4. **Staging Environment Stage**: Deploy infrastructure + application, run E2E tests
5. **Production Environment Stage**: Manual approval gate, deploy infrastructure + application

**Supporting Components:**

- **CodeBuild Projects**: Execute builds, tests, deployments, and security scans
- **S3 Artifacts Bucket**: Store build artifacts, test results, deployment packages
- **CloudWatch Alarms**: Monitor application and infrastructure health
- **EventBridge Rules**: Detect alarm state changes and trigger rollback
- **Rollback Lambda**: Orchestrate automated rollback procedures
- **SNS Topics**: Send notifications for deployment events
- **DynamoDB Table**: Track deployment history and rollback state

### 2.3 Design Decisions

**Decision 1: Use AWS CodePipeline over GitHub Actions**
- **Rationale**: Native AWS integration, better control over deployment gates, built-in artifact management, and seamless integration with existing AWS infrastructure
- **Trade-off**: Less flexibility than GitHub Actions, but better suited for AWS-centric deployments

**Decision 2: Sequential Environment Deployment**
- **Rationale**: Progressive validation reduces production risk, allows early detection of issues
- **Trade-off**: Longer total deployment time, but significantly safer

**Decision 3: Infrastructure-First Deployment**
- **Rationale**: Ensures infrastructure is ready before application deployment, prevents application failures due to missing resources
- **Trade-off**: Slightly longer deployment time per environment

**Decision 4: EventBridge-Triggered Rollback**
- **Rationale**: Real-time alarm monitoring, decoupled architecture, extensible for future monitoring sources
- **Trade-off**: Additional complexity, but provides automated recovery

**Decision 5: DynamoDB for Deployment State**
- **Rationale**: Fast reads/writes, serverless, supports TTL for automatic cleanup
- **Trade-off**: Eventually consistent, but acceptable for deployment tracking

## 3. Detailed Design

### 3.1 Pipeline Structure


#### 3.1.1 Source Stage

**Purpose**: Detect changes to main branch and initiate pipeline

**Implementation**:
```typescript
const sourceAction = new codepipeline_actions.GitHubSourceAction({
  actionName: 'GitHub_Source',
  owner: 'organization',
  repo: 'kiro-codebuild-worker',
  branch: 'main',
  oauthToken: cdk.SecretValue.secretsManager('github-token'),
  output: sourceOutput,
  trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
});
```

**Outputs**: Source code artifact to S3

#### 3.1.2 Build Stage

**Purpose**: Compile code, run unit tests, perform security scanning

**CodeBuild Project Configuration**:
```yaml
# buildspec-build.yml
version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 18
    commands:
      - npm ci
  pre_build:
    commands:
      - npm run lint
      - npm audit --audit-level=high
      - npm run test:coverage
  build:
    commands:
      - npm run build
      - cd infrastructure && npm ci && npm run build
  post_build:
    commands:
      - echo "Running security scans"
      - npm install -g cfn-lint cfn-guard
      - cfn-lint infrastructure/cdk.out/**/*.template.json
      - cfn-guard validate --rules security-rules.guard --data infrastructure/cdk.out/**/*.template.json
artifacts:
  files:
    - '**/*'
  name: BuildArtifact
reports:
  test-results:
    files:
      - 'coverage/junit.xml'
    file-format: 'JUNITXML'
  coverage-report:
    files:
      - 'coverage/coverage-final.json'
    file-format: 'CLOVERXML'
```

**Security Scanning**:
- **cfn-lint**: Validates CloudFormation templates for errors and best practices
- **cfn-guard**: Enforces security policies on infrastructure code
- **npm audit**: Scans dependencies for known vulnerabilities
- **ESLint**: Checks TypeScript code quality

**Success Criteria**:
- All tests pass
- Code coverage ≥80%
- No CRITICAL or HIGH severity vulnerabilities
- No cfn-lint errors
- No cfn-guard policy violations

#### 3.1.3 Test Environment Stage

**Purpose**: Deploy to test environment and run integration tests

**Sub-Actions**:
1. **Infrastructure Change Detection**

   ```typescript
   // Check if infrastructure/ directory changed
   const infraChanged = await detectInfrastructureChanges(commitId);
   if (infraChanged) {
     await deployInfrastructure('test');
   }
   ```

2. **Infrastructure Deployment** (if changes detected)
   ```bash
   cd infrastructure
   cdk deploy --all --context environment=test --require-approval never
   ```

3. **Application Deployment**
   ```bash
   # Deploy application code to CodeBuild worker
   aws s3 sync dist/ s3://kiro-worker-test-artifacts/
   ```

4. **Integration Tests**
   ```yaml
   # buildspec-integration-test.yml
   version: 0.2
   phases:
     build:
       commands:
         - npm run test:integration
   reports:
     integration-results:
       files:
         - 'test-results/integration-junit.xml'
       file-format: 'JUNITXML'
   ```

**Success Criteria**:
- Infrastructure deployment succeeds (if needed)
- Application deployment succeeds
- All integration tests pass
- No new CloudWatch alarms triggered

#### 3.1.4 Staging Environment Stage

**Purpose**: Deploy to staging environment and run E2E tests

**Sub-Actions**:
1. Infrastructure Change Detection & Deployment (same as test)
2. Application Deployment
3. **End-to-End Tests**
   ```yaml
   # buildspec-e2e-test.yml
   version: 0.2
   phases:
     build:
       commands:
         - npm run test:e2e
   reports:
     e2e-results:
       files:
         - 'test-results/e2e-junit.xml'
       file-format: 'JUNITXML'
   ```

4. **Health Check Monitoring** (5 minutes)
   ```typescript
   await monitorHealthChecks({
     environment: 'staging',
     duration: Duration.minutes(5),
     alarmNames: ['staging-*']
   });
   ```

**Success Criteria**:
- Infrastructure deployment succeeds (if needed)
- Application deployment succeeds
- All E2E tests pass
- Health checks pass for 5 minutes
- No alarms in ALARM state

#### 3.1.5 Production Environment Stage

**Purpose**: Deploy to production with manual approval

**Sub-Actions**:
1. **Manual Approval Gate**

   ```typescript
   const approvalAction = new codepipeline_actions.ManualApprovalAction({
     actionName: 'Approve_Production_Deployment',
     notificationTopic: approvalTopic,
     additionalInformation: 'Review test results and approve production deployment',
     externalEntityLink: `https://github.com/${owner}/${repo}/commit/${commitId}`
   });
   ```

2. Infrastructure Change Detection & Deployment
3. Application Deployment
4. **Post-Deployment Health Check** (5 minutes)
5. **Update GitHub Commit Status**

**Success Criteria**:
- Manual approval received within 24 hours
- Infrastructure deployment succeeds (if needed)
- Application deployment succeeds
- Health checks pass for 5 minutes
- No alarms in ALARM state

### 3.2 Infrastructure Change Detection

**Purpose**: Avoid unnecessary CDK deployments when only application code changes

**Implementation**:
```typescript
export class InfrastructureChangeDetector {
  async detectChanges(commitId: string): Promise<boolean> {
    // Get changed files in commit
    const changedFiles = await this.getChangedFiles(commitId);
    
    // Check if any infrastructure files changed
    const infraFiles = changedFiles.filter(file => 
      file.startsWith('infrastructure/') ||
      file === 'buildspec.yml'
    );
    
    if (infraFiles.length === 0) {
      return false;
    }
    
    // Run CDK diff to check for actual changes
    const diffOutput = await this.runCdkDiff();
    
    // Parse diff output to determine if changes are meaningful
    return this.hasMeaningfulChanges(diffOutput);
  }
  
  private hasMeaningfulChanges(diffOutput: string): boolean {
    // Ignore metadata-only changes
    const meaningfulPatterns = [
      /Resources:/,
      /Parameters:/,
      /Outputs:/
    ];
    
    return meaningfulPatterns.some(pattern => pattern.test(diffOutput));
  }
}
```

**Design Decision**: Use both file-based detection and CDK diff
- **Rationale**: File-based detection is fast but may have false positives; CDK diff is accurate but slower
- **Trade-off**: Two-step process adds complexity but prevents unnecessary deployments

### 3.3 Monitoring Integration


#### 3.3.1 Health Check System

**Purpose**: Monitor application health during and after deployment

**Implementation**:
```typescript
export class HealthCheckMonitor {
  constructor(
    private readonly cloudwatch: CloudWatchClient,
    private readonly alarmNames: string[]
  ) {}
  
  async monitorHealthChecks(duration: Duration): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const endTime = startTime + duration.toMilliseconds();
    
    while (Date.now() < endTime) {
      const alarmStates = await this.checkAlarms();
      
      if (alarmStates.some(state => state === 'ALARM')) {
        return {
          success: false,
          failedAlarms: alarmStates.filter(a => a.state === 'ALARM')
        };
      }
      
      // Check every 30 seconds
      await this.sleep(30000);
    }
    
    return { success: true, failedAlarms: [] };
  }
  
  private async checkAlarms(): Promise<AlarmState[]> {
    const command = new DescribeAlarmsCommand({
      AlarmNames: this.alarmNames,
      StateValue: 'ALARM'
    });
    
    const response = await this.cloudwatch.send(command);
    return response.MetricAlarms?.map(alarm => ({
      name: alarm.AlarmName!,
      state: alarm.StateValue!,
      reason: alarm.StateReason
    })) || [];
  }
}
```

**Monitored Metrics**:
- Build success/failure rate
- Test failure rate
- Application error rate
- Lambda invocation errors
- DynamoDB throttling
- API response times

#### 3.3.2 EventBridge Integration

**Purpose**: Detect alarm state changes and trigger rollback

**Implementation**:
```typescript
// EventBridge rule for alarm state changes
const alarmRule = new events.Rule(this, 'AlarmStateChangeRule', {
  eventPattern: {
    source: ['aws.cloudwatch'],
    detailType: ['CloudWatch Alarm State Change'],
    detail: {
      alarmName: [{ prefix: `kiro-worker-${environment}` }],
      state: { value: ['ALARM'] }
    }
  }
});

alarmRule.addTarget(new targets.LambdaFunction(rollbackLambda));
```

**Event Processing**:
```typescript
export class AlarmEventProcessor {
  async processAlarmEvent(event: CloudWatchAlarmEvent): Promise<void> {
    const { alarmName, state, previousState } = event.detail;
    
    // Check if alarm is deployment-related
    if (!this.isDeploymentAlarm(alarmName)) {
      return;
    }
    
    // Get current deployment
    const deployment = await this.getCurrentDeployment();
    
    if (!deployment) {
      logger.warn('No active deployment found for alarm', { alarmName });
      return;
    }
    
    // Trigger rollback
    await this.triggerRollback(deployment, alarmName);
  }
}
```

### 3.4 Automated Rollback System


#### 3.4.1 Rollback Strategy

**Rollback Levels**:

1. **Stage-Level Rollback**: Revert current stage to previous version
   - Fastest recovery
   - Minimal impact
   - Used for single-environment failures

2. **Full Rollback**: Revert all environments to last known good version
   - Complete recovery
   - Used when stage rollback fails
   - Ensures consistency across environments

**Rollback Triggers**:
- Test failures (unit, integration, E2E)
- Security scan failures
- Deployment failures
- CloudWatch alarm state changes to ALARM
- Health check failures

#### 3.4.2 Rollback Implementation

```typescript
export class RollbackOrchestrator {
  constructor(
    private readonly codepipeline: CodePipelineClient,
    private readonly deploymentTable: DynamoDBTable,
    private readonly notificationTopic: SNSTopic
  ) {}
  
  async executeRollback(
    deployment: Deployment,
    reason: string
  ): Promise<RollbackResult> {
    logger.info('Starting rollback', { deployment, reason });
    
    try {
      // Record rollback initiation
      await this.recordRollbackStart(deployment, reason);
      
      // Send notification
      await this.notifyRollbackStart(deployment, reason);
      
      // Attempt stage-level rollback first
      const stageResult = await this.rollbackStage(deployment);
      
      if (stageResult.success) {
        await this.recordRollbackSuccess(deployment, 'stage');
        await this.notifyRollbackSuccess(deployment, 'stage');
        return { success: true, level: 'stage' };
      }
      
      // If stage rollback fails, attempt full rollback
      logger.warn('Stage rollback failed, attempting full rollback');
      const fullResult = await this.rollbackFull(deployment);
      
      if (fullResult.success) {
        await this.recordRollbackSuccess(deployment, 'full');
        await this.notifyRollbackSuccess(deployment, 'full');
        return { success: true, level: 'full' };
      }
      
      // Both rollback attempts failed
      await this.recordRollbackFailure(deployment);
      await this.notifyRollbackFailure(deployment);
      return { success: false, level: 'none' };
      
    } catch (error) {
      logger.error('Rollback orchestration failed', error);
      await this.notifyRollbackFailure(deployment);
      throw new RollbackError('Rollback orchestration failed', { cause: error });
    }
  }
  
  private async rollbackStage(deployment: Deployment): Promise<RollbackResult> {
    const { environment, previousVersion } = deployment;
    
    // Get previous deployment artifacts
    const artifacts = await this.getDeploymentArtifacts(previousVersion);
    
    // Rollback infrastructure if needed
    if (deployment.infrastructureChanged) {
      await this.rollbackInfrastructure(environment, previousVersion);
    }
    
    // Rollback application
    await this.rollbackApplication(environment, artifacts);
    
    // Validate rollback
    const healthCheck = await this.validateRollback(environment);
    
    return { success: healthCheck.success };
  }
  
  private async rollbackFull(deployment: Deployment): Promise<RollbackResult> {
    const lastKnownGood = await this.getLastKnownGoodDeployment();
    
    for (const env of ['production', 'staging', 'test']) {
      await this.rollbackStage({
        ...deployment,
        environment: env,
        previousVersion: lastKnownGood.version
      });
    }
    
    return { success: true };
  }
}
```

#### 3.4.3 Rollback Validation

**Purpose**: Ensure rollback was successful

**Implementation**:
```typescript
export class RollbackValidator {
  async validateRollback(environment: string): Promise<ValidationResult> {
    // Wait for deployment to stabilize
    await this.sleep(60000); // 1 minute
    
    // Check alarms
    const alarmCheck = await this.checkAlarms(environment);
    if (!alarmCheck.success) {
      return { success: false, reason: 'Alarms still in ALARM state' };
    }
    
    // Run health checks
    const healthCheck = await this.runHealthChecks(environment);
    if (!healthCheck.success) {
      return { success: false, reason: 'Health checks failed' };
    }
    
    // Verify application version
    const versionCheck = await this.verifyVersion(environment);
    if (!versionCheck.success) {
      return { success: false, reason: 'Version mismatch' };
    }
    
    return { success: true };
  }
}
```

### 3.5 Deployment State Management


#### 3.5.1 DynamoDB Schema

**Purpose**: Track deployment history and current state

**Table Schema**:
```typescript
interface DeploymentRecord {
  // Partition key
  deploymentId: string;  // Format: {environment}#{timestamp}
  
  // Attributes
  environment: 'test' | 'staging' | 'production';
  version: string;  // Git commit SHA
  status: 'in_progress' | 'succeeded' | 'failed' | 'rolled_back';
  startTime: number;  // Unix timestamp
  endTime?: number;
  
  // Deployment details
  infrastructureChanged: boolean;
  commitMessage: string;
  commitAuthor: string;
  pipelineExecutionId: string;
  
  // Test results
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  e2eTestsPassed: boolean;
  coveragePercentage: number;
  
  // Rollback information
  rollbackReason?: string;
  rollbackLevel?: 'stage' | 'full';
  rollbackTime?: number;
  
  // Artifacts
  artifactLocation: string;
  
  // TTL for automatic cleanup (90 days)
  expiresAt: number;
}

// GSI for querying by environment and status
interface EnvironmentStatusIndex {
  environment: string;  // Partition key
  status: string;       // Sort key
}
```

**Table Configuration**:
```typescript
const deploymentsTable = new dynamodb.Table(this, 'DeploymentsTable', {
  tableName: `kiro-pipeline-${environment}-deployments`,
  partitionKey: {
    name: 'deploymentId',
    type: dynamodb.AttributeType.STRING
  },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
  pointInTimeRecovery: true,
  timeToLiveAttribute: 'expiresAt',
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
});

// GSI for environment queries
deploymentsTable.addGlobalSecondaryIndex({
  indexName: 'EnvironmentStatusIndex',
  partitionKey: {
    name: 'environment',
    type: dynamodb.AttributeType.STRING
  },
  sortKey: {
    name: 'status',
    type: dynamodb.AttributeType.STRING
  }
});
```

#### 3.5.2 Deployment State Manager

```typescript
export class DeploymentStateManager {
  constructor(
    private readonly table: DynamoDBTable,
    private readonly tableName: string
  ) {}
  
  async recordDeploymentStart(deployment: DeploymentInfo): Promise<void> {
    const record: DeploymentRecord = {
      deploymentId: `${deployment.environment}#${Date.now()}`,
      environment: deployment.environment,
      version: deployment.commitSha,
      status: 'in_progress',
      startTime: Date.now(),
      infrastructureChanged: deployment.infrastructureChanged,
      commitMessage: deployment.commitMessage,
      commitAuthor: deployment.commitAuthor,
      pipelineExecutionId: deployment.pipelineExecutionId,
      artifactLocation: deployment.artifactLocation,
      expiresAt: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days
      unitTestsPassed: false,
      integrationTestsPassed: false,
      e2eTestsPassed: false,
      coveragePercentage: 0
    };
    
    await this.table.put({ Item: record });
  }
  
  async updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus,
    testResults?: TestResults
  ): Promise<void> {
    const updates: Record<string, any> = {
      status,
      endTime: Date.now()
    };
    
    if (testResults) {
      updates.unitTestsPassed = testResults.unitTestsPassed;
      updates.integrationTestsPassed = testResults.integrationTestsPassed;
      updates.e2eTestsPassed = testResults.e2eTestsPassed;
      updates.coveragePercentage = testResults.coveragePercentage;
    }
    
    await this.table.update({
      Key: { deploymentId },
      UpdateExpression: this.buildUpdateExpression(updates),
      ExpressionAttributeValues: updates
    });
  }
  
  async getLastKnownGoodDeployment(environment: string): Promise<DeploymentRecord | null> {
    const result = await this.table.query({
      IndexName: 'EnvironmentStatusIndex',
      KeyConditionExpression: 'environment = :env AND status = :status',
      ExpressionAttributeValues: {
        ':env': environment,
        ':status': 'succeeded'
      },
      ScanIndexForward: false,  // Descending order
      Limit: 1
    });
    
    return result.Items?.[0] || null;
  }
}
```

### 3.6 Notification System


#### 3.6.1 SNS Topics

**Topic Structure**:
```typescript
// Deployment notifications
const deploymentTopic = new sns.Topic(this, 'DeploymentTopic', {
  topicName: `kiro-pipeline-${environment}-deployments`,
  displayName: 'Pipeline Deployment Notifications'
});

// Approval notifications
const approvalTopic = new sns.Topic(this, 'ApprovalTopic', {
  topicName: `kiro-pipeline-${environment}-approvals`,
  displayName: 'Pipeline Approval Requests'
});

// Rollback notifications
const rollbackTopic = new sns.Topic(this, 'RollbackTopic', {
  topicName: `kiro-pipeline-${environment}-rollbacks`,
  displayName: 'Pipeline Rollback Notifications'
});
```

**Subscriptions**:
```typescript
// Email subscriptions
deploymentTopic.addSubscription(
  new subscriptions.EmailSubscription('devops-team@example.com')
);

// Slack integration (via Lambda)
deploymentTopic.addSubscription(
  new subscriptions.LambdaSubscription(slackNotifierLambda)
);
```

#### 3.6.2 Notification Messages

**Deployment Start**:
```json
{
  "event": "deployment_started",
  "environment": "production",
  "version": "abc123def",
  "commitMessage": "feat: add new feature",
  "commitAuthor": "developer@example.com",
  "pipelineExecutionId": "execution-123",
  "timestamp": "2026-01-27T10:00:00Z"
}
```

**Deployment Success**:
```json
{
  "event": "deployment_succeeded",
  "environment": "production",
  "version": "abc123def",
  "duration": "45m 30s",
  "testResults": {
    "unitTests": "passed",
    "integrationTests": "passed",
    "e2eTests": "passed",
    "coverage": "85%"
  },
  "timestamp": "2026-01-27T10:45:30Z"
}
```

**Rollback Initiated**:
```json
{
  "event": "rollback_initiated",
  "environment": "production",
  "currentVersion": "abc123def",
  "targetVersion": "xyz789abc",
  "reason": "CloudWatch alarm: high-error-rate in ALARM state",
  "level": "stage",
  "timestamp": "2026-01-27T11:00:00Z"
}
```

### 3.7 Security Scanning


#### 3.7.1 cfn-guard Rules

**Purpose**: Enforce AWS security best practices on CloudFormation templates

**Security Rules** (`security-rules.guard`):
```
# S3 Buckets must have encryption enabled
rule s3_bucket_encryption {
  Resources.*[ Type == 'AWS::S3::Bucket' ] {
    Properties {
      BucketEncryption exists
      BucketEncryption.ServerSideEncryptionConfiguration[*] {
        ServerSideEncryptionByDefault.SSEAlgorithm in ['AES256', 'aws:kms']
      }
    }
  }
}

# S3 Buckets must block public access
rule s3_bucket_public_access {
  Resources.*[ Type == 'AWS::S3::Bucket' ] {
    Properties {
      PublicAccessBlockConfiguration exists
      PublicAccessBlockConfiguration {
        BlockPublicAcls == true
        BlockPublicPolicy == true
        IgnorePublicAcls == true
        RestrictPublicBuckets == true
      }
    }
  }
}

# DynamoDB tables must have encryption
rule dynamodb_encryption {
  Resources.*[ Type == 'AWS::DynamoDB::Table' ] {
    Properties {
      SSESpecification exists
      SSESpecification.SSEEnabled == true
    }
  }
}

# Lambda functions must have DLQ configured
rule lambda_dlq {
  Resources.*[ Type == 'AWS::Lambda::Function' ] {
    Properties {
      DeadLetterConfig exists
    }
  }
}

# IAM roles must not have wildcard permissions
rule iam_no_wildcard {
  Resources.*[ Type == 'AWS::IAM::Role' ] {
    Properties.Policies[*].PolicyDocument.Statement[*] {
      when Action == '*' {
        Effect != 'Allow'
      }
      when Resource == '*' {
        Effect != 'Allow'
      }
    }
  }
}
```

#### 3.7.2 Dependency Scanning

**npm audit Configuration**:
```json
{
  "scripts": {
    "audit:check": "npm audit --audit-level=high --production"
  }
}
```

**Audit Thresholds**:
- **CRITICAL**: Block deployment
- **HIGH**: Block deployment
- **MODERATE**: Warning only
- **LOW**: Informational

**Allowlist for Known False Positives**:
```json
{
  "auditAllowlist": [
    "GHSA-xxxx-yyyy-zzzz"  // Known false positive with justification
  ]
}
```

### 3.8 Performance Optimization


#### 3.8.1 Build Optimization

**Caching Strategy**:
```typescript
const project = new codebuild.Project(this, 'BuildProject', {
  cache: codebuild.Cache.local(
    codebuild.LocalCacheMode.SOURCE,
    codebuild.LocalCacheMode.DOCKER_LAYER,
    codebuild.LocalCacheMode.CUSTOM
  )
});
```

**Custom Cache Paths**:
```yaml
cache:
  paths:
    - 'node_modules/**/*'
    - 'infrastructure/node_modules/**/*'
    - '.npm/**/*'
```

**Parallel Test Execution**:
```json
{
  "scripts": {
    "test:parallel": "vitest run --threads --maxThreads=4"
  }
}
```

#### 3.8.2 Deployment Optimization

**Parallel Environment Deployments** (where safe):
```typescript
// Deploy test and staging in parallel (they don't depend on each other)
await Promise.all([
  deployToEnvironment('test'),
  deployToEnvironment('staging')
]);

// Production deploys after both succeed
await deployToEnvironment('production');
```

**Design Decision**: Sequential vs Parallel Deployment
- **Current**: Sequential (test → staging → production)
- **Alternative**: Parallel test + staging, then production
- **Rationale**: Sequential is safer for initial implementation; can optimize later
- **Trade-off**: Longer deployment time but lower risk

#### 3.8.3 Artifact Management

**Artifact Lifecycle**:
```typescript
const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
  lifecycleRules: [
    {
      id: 'DeleteOldArtifacts',
      expiration: cdk.Duration.days(90)
    },
    {
      id: 'TransitionToIA',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: cdk.Duration.days(30)
        }
      ]
    }
  ]
});
```

## 4. Data Models

### 4.1 Deployment Record

```typescript
interface DeploymentRecord {
  deploymentId: string;
  environment: Environment;
  version: string;
  status: DeploymentStatus;
  startTime: number;
  endTime?: number;
  infrastructureChanged: boolean;
  commitMessage: string;
  commitAuthor: string;
  pipelineExecutionId: string;
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  e2eTestsPassed: boolean;
  coveragePercentage: number;
  rollbackReason?: string;
  rollbackLevel?: RollbackLevel;
  rollbackTime?: number;
  artifactLocation: string;
  expiresAt: number;
}

type Environment = 'test' | 'staging' | 'production';
type DeploymentStatus = 'in_progress' | 'succeeded' | 'failed' | 'rolled_back';
type RollbackLevel = 'stage' | 'full';
```

### 4.2 Health Check Result

```typescript
interface HealthCheckResult {
  success: boolean;
  failedAlarms: AlarmInfo[];
  timestamp: number;
}

interface AlarmInfo {
  name: string;
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  reason?: string;
}
```

### 4.3 Test Results

```typescript
interface TestResults {
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  e2eTestsPassed: boolean;
  coveragePercentage: number;
  testSummary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  failedTests?: FailedTest[];
}

interface FailedTest {
  name: string;
  suite: string;
  error: string;
  stackTrace?: string;
}
```

## 5. API Specifications

### 5.1 Rollback Lambda Handler


**Input Event** (CloudWatch Alarm via EventBridge):
```typescript
interface AlarmEvent {
  version: string;
  id: string;
  'detail-type': 'CloudWatch Alarm State Change';
  source: 'aws.cloudwatch';
  account: string;
  time: string;
  region: string;
  detail: {
    alarmName: string;
    state: {
      value: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
      reason: string;
      timestamp: string;
    };
    previousState: {
      value: string;
      timestamp: string;
    };
  };
}
```

**Handler Implementation**:
```typescript
export async function handler(event: AlarmEvent): Promise<void> {
  const orchestrator = new RollbackOrchestrator(
    new CodePipelineClient({}),
    new DeploymentStateManager(dynamoClient, tableName),
    new SNSNotifier(snsClient, topicArn)
  );
  
  const processor = new AlarmEventProcessor(orchestrator);
  await processor.processAlarmEvent(event);
}
```

### 5.2 Infrastructure Change Detection API

```typescript
interface InfrastructureChangeDetector {
  /**
   * Detects if infrastructure changes are present in a commit
   * @param commitId - Git commit SHA
   * @returns true if infrastructure changes detected
   */
  detectChanges(commitId: string): Promise<boolean>;
  
  /**
   * Gets list of changed files in a commit
   * @param commitId - Git commit SHA
   * @returns Array of changed file paths
   */
  getChangedFiles(commitId: string): Promise<string[]>;
  
  /**
   * Runs CDK diff to check for infrastructure changes
   * @returns CDK diff output
   */
  runCdkDiff(): Promise<string>;
  
  /**
   * Determines if diff output contains meaningful changes
   * @param diffOutput - CDK diff output
   * @returns true if meaningful changes detected
   */
  hasMeaningfulChanges(diffOutput: string): boolean;
}
```

### 5.3 Health Check Monitor API

```typescript
interface HealthCheckMonitor {
  /**
   * Monitors health checks for specified duration
   * @param duration - How long to monitor
   * @returns Health check result
   */
  monitorHealthChecks(duration: Duration): Promise<HealthCheckResult>;
  
  /**
   * Checks current state of all alarms
   * @returns Array of alarm states
   */
  checkAlarms(): Promise<AlarmState[]>;
  
  /**
   * Runs application health checks
   * @returns Health check result
   */
  runHealthChecks(): Promise<HealthCheckResult>;
}
```

## 6. Error Handling

### 6.1 Error Types

```typescript
export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly stage: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export class RollbackError extends Error {
  constructor(
    message: string,
    public readonly deployment: Deployment,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RollbackError';
  }
}

export class HealthCheckError extends Error {
  constructor(
    message: string,
    public readonly failedAlarms: AlarmInfo[],
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'HealthCheckError';
  }
}

export class SecurityScanError extends Error {
  constructor(
    message: string,
    public readonly violations: SecurityViolation[],
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SecurityScanError';
  }
}
```

### 6.2 Error Recovery


**Pipeline Stage Failures**:
```typescript
try {
  await executeStage(stage);
} catch (error) {
  logger.error('Stage execution failed', { stage, error });
  
  // Record failure
  await deploymentStateManager.updateDeploymentStatus(
    deploymentId,
    'failed'
  );
  
  // Trigger rollback
  await rollbackOrchestrator.executeRollback(deployment, error.message);
  
  // Send notification
  await notifier.notifyFailure(deployment, error);
  
  throw new PipelineError('Stage execution failed', stage, error);
}
```

**Rollback Failures**:
```typescript
try {
  await rollbackOrchestrator.executeRollback(deployment, reason);
} catch (error) {
  logger.error('Rollback failed', { deployment, error });
  
  // Escalate to manual intervention
  await notifier.notifyRollbackFailure(deployment, error);
  
  // Create incident ticket
  await incidentManager.createIncident({
    severity: 'critical',
    title: 'Automated rollback failed',
    description: `Rollback failed for ${deployment.environment}`,
    deployment
  });
  
  throw new RollbackError('Rollback failed', deployment, error);
}
```

**Transient Failures**:
```typescript
// Retry with exponential backoff
const result = await retry(
  async () => await executeOperation(),
  {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  }
);
```

## 7. Testing Strategy

### 7.1 Unit Tests

**Components to Test**:
- InfrastructureChangeDetector
- HealthCheckMonitor
- RollbackOrchestrator
- DeploymentStateManager
- AlarmEventProcessor
- NotificationService

**Example Test**:
```typescript
describe('RollbackOrchestrator', () => {
  let orchestrator: RollbackOrchestrator;
  let mockCodePipeline: MockCodePipelineClient;
  let mockDeploymentTable: MockDynamoDBTable;
  
  beforeEach(() => {
    mockCodePipeline = new MockCodePipelineClient();
    mockDeploymentTable = new MockDynamoDBTable();
    orchestrator = new RollbackOrchestrator(
      mockCodePipeline,
      mockDeploymentTable,
      mockNotificationTopic
    );
  });
  
  it('should execute stage-level rollback successfully', async () => {
    const deployment = createMockDeployment();
    const result = await orchestrator.executeRollback(deployment, 'test failure');
    
    expect(result.success).toBe(true);
    expect(result.level).toBe('stage');
    expect(mockCodePipeline.rollbackCalls).toHaveLength(1);
  });
  
  it('should fallback to full rollback when stage rollback fails', async () => {
    mockCodePipeline.rollbackStage.mockRejectedValue(new Error('Rollback failed'));
    
    const deployment = createMockDeployment();
    const result = await orchestrator.executeRollback(deployment, 'test failure');
    
    expect(result.success).toBe(true);
    expect(result.level).toBe('full');
  });
});
```

### 7.2 Integration Tests

**Test Scenarios**:
1. Full pipeline execution (source → production)
2. Pipeline with infrastructure changes
3. Pipeline with application-only changes
4. Test failure triggers rollback
5. Alarm triggers rollback
6. Manual approval timeout
7. Concurrent deployment prevention

**Example Integration Test**:
```typescript
describe('Pipeline Integration', () => {
  it('should deploy through all environments successfully', async () => {
    // Trigger pipeline
    await triggerPipeline('main', 'abc123def');
    
    // Wait for source stage
    await waitForStageCompletion('Source');
    
    // Wait for build stage
    await waitForStageCompletion('Build');
    expect(await getTestResults()).toMatchObject({
      unitTestsPassed: true,
      coveragePercentage: expect.any(Number)
    });
    
    // Wait for test environment
    await waitForStageCompletion('TestEnvironment');
    expect(await getIntegrationTestResults()).toMatchObject({
      integrationTestsPassed: true
    });
    
    // Wait for staging environment
    await waitForStageCompletion('StagingEnvironment');
    expect(await getE2ETestResults()).toMatchObject({
      e2eTestsPassed: true
    });
    
    // Approve production
    await approveProductionDeployment();
    
    // Wait for production deployment
    await waitForStageCompletion('ProductionEnvironment');
    
    // Verify deployment record
    const deployment = await getDeploymentRecord('production');
    expect(deployment.status).toBe('succeeded');
  });
});
```

### 7.3 Property-Based Tests


**Property 1: Rollback Idempotency**
```typescript
it('should produce same result when rollback is executed multiple times', () => {
  fc.assert(
    fc.asyncProperty(
      fc.record({
        environment: fc.constantFrom('test', 'staging', 'production'),
        version: fc.hexaString({ minLength: 40, maxLength: 40 }),
        previousVersion: fc.hexaString({ minLength: 40, maxLength: 40 })
      }),
      async (deployment) => {
        const result1 = await orchestrator.executeRollback(deployment, 'test');
        const result2 = await orchestrator.executeRollback(deployment, 'test');
        
        return result1.success === result2.success &&
               result1.level === result2.level;
      }
    )
  );
});
```

**Property 2: Deployment State Consistency**
```typescript
it('should maintain consistent deployment state across operations', () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        operation: fc.constantFrom('start', 'update', 'complete'),
        deploymentId: fc.string(),
        status: fc.constantFrom('in_progress', 'succeeded', 'failed')
      })),
      async (operations) => {
        for (const op of operations) {
          await stateManager.performOperation(op);
        }
        
        const finalState = await stateManager.getState();
        return isValidState(finalState);
      }
    )
  );
});
```

**Property 3: Health Check Monotonicity**
```typescript
it('should never report success after reporting failure within same check', () => {
  fc.assert(
    fc.asyncProperty(
      fc.nat({ max: 300 }), // Duration in seconds
      async (duration) => {
        const results: boolean[] = [];
        const monitor = new HealthCheckMonitor(alarmNames);
        
        // Collect results over time
        for (let i = 0; i < duration; i += 30) {
          const result = await monitor.checkAlarms();
          results.push(result.success);
          
          if (!result.success) {
            // Once failed, should not succeed in same monitoring session
            const remainingResults = results.slice(results.indexOf(false));
            return remainingResults.every(r => !r);
          }
        }
        
        return true;
      }
    )
  );
});
```

## 8. Deployment Plan

### 8.1 Infrastructure Deployment

**Phase 1: Core Infrastructure**
```bash
cd infrastructure
cdk deploy KiroPipelineCore --context environment=test
```

Resources created:
- S3 artifacts bucket
- DynamoDB deployments table
- CloudWatch log groups
- KMS encryption keys

**Phase 2: Pipeline Stack**
```bash
cdk deploy KiroPipeline --context environment=test
```

Resources created:
- CodePipeline
- CodeBuild projects (build, test, deploy)
- IAM roles and policies
- EventBridge rules

**Phase 3: Monitoring Stack**
```bash
cdk deploy KiroPipelineMonitoring --context environment=test
```

Resources created:
- CloudWatch alarms
- SNS topics and subscriptions
- Rollback Lambda function
- CloudWatch dashboard

### 8.2 Configuration

**Secrets to Create**:
```bash
# GitHub token
aws secretsmanager create-secret \
  --name kiro-pipeline-test-github-token \
  --secret-string "ghp_xxxxxxxxxxxx"

# Slack webhook (optional)
aws secretsmanager create-secret \
  --name kiro-pipeline-test-slack-webhook \
  --secret-string "https://hooks.slack.com/services/xxx"
```

**Parameters to Set**:
```bash
# GitHub repository configuration
aws ssm put-parameter \
  --name /kiro-pipeline/test/github-owner \
  --value "organization" \
  --type String

aws ssm put-parameter \
  --name /kiro-pipeline/test/github-repo \
  --value "kiro-codebuild-worker" \
  --type String
```

### 8.3 Validation

**Post-Deployment Checks**:
```bash
# Verify pipeline exists
aws codepipeline get-pipeline --name kiro-pipeline-test

# Verify CodeBuild projects
aws codebuild list-projects | grep kiro-pipeline-test

# Verify S3 bucket
aws s3 ls | grep kiro-pipeline-test-artifacts

# Verify DynamoDB table
aws dynamodb describe-table --table-name kiro-pipeline-test-deployments

# Verify Lambda function
aws lambda get-function --function-name kiro-pipeline-test-rollback
```

## 9. Monitoring and Observability

### 9.1 CloudWatch Dashboard

**Dashboard Configuration**:
```typescript
const dashboard = new cloudwatch.Dashboard(this, 'PipelineDashboard', {
  dashboardName: `kiro-pipeline-${environment}-dashboard`
});

// Pipeline execution metrics
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Pipeline Executions',
    left: [
      pipeline.metricSucceeded({ statistic: 'Sum', period: Duration.hours(1) }),
      pipeline.metricFailed({ statistic: 'Sum', period: Duration.hours(1) })
    ]
  })
);

// Deployment duration
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Deployment Duration',
    left: [
      new cloudwatch.Metric({
        namespace: 'KiroPipeline',
        metricName: 'DeploymentDuration',
        statistic: 'Average',
        period: Duration.hours(1)
      })
    ]
  })
);

// Rollback metrics
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Rollbacks',
    left: [
      new cloudwatch.Metric({
        namespace: 'KiroPipeline',
        metricName: 'RollbackCount',
        statistic: 'Sum',
        period: Duration.hours(1)
      })
    ]
  })
);

// Test results
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Test Success Rate',
    left: [
      new cloudwatch.Metric({
        namespace: 'KiroPipeline',
        metricName: 'TestSuccessRate',
        statistic: 'Average',
        period: Duration.hours(1)
      })
    ]
  })
);
```

### 9.2 Custom Metrics

**Metrics Published**:
```typescript
export class PipelineMetrics {
  private readonly cloudwatch: CloudWatchClient;
  private readonly namespace = 'KiroPipeline';
  
  async publishDeploymentDuration(environment: string, duration: number): Promise<void> {
    await this.cloudwatch.send(new PutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: [{
        MetricName: 'DeploymentDuration',
        Value: duration,
        Unit: 'Seconds',
        Dimensions: [
          { Name: 'Environment', Value: environment }
        ],
        Timestamp: new Date()
      }]
    }));
  }
  
  async publishRollback(environment: string, level: RollbackLevel): Promise<void> {
    await this.cloudwatch.send(new PutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: [{
        MetricName: 'RollbackCount',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          { Name: 'Environment', Value: environment },
          { Name: 'Level', Value: level }
        ],
        Timestamp: new Date()
      }]
    }));
  }
  
  async publishTestResults(results: TestResults): Promise<void> {
    const successRate = (results.testSummary.passed / results.testSummary.total) * 100;
    
    await this.cloudwatch.send(new PutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: [{
        MetricName: 'TestSuccessRate',
        Value: successRate,
        Unit: 'Percent',
        Timestamp: new Date()
      }]
    }));
  }
}
```

### 9.3 Alarms

**Pipeline Failure Alarm**:
```typescript
const pipelineFailureAlarm = new cloudwatch.Alarm(this, 'PipelineFailureAlarm', {
  alarmName: `kiro-pipeline-${environment}-failures`,
  metric: pipeline.metricFailed({
    statistic: 'Sum',
    period: Duration.hours(1)
  }),
  threshold: 3,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});

pipelineFailureAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

**Rollback Alarm**:
```typescript
const rollbackAlarm = new cloudwatch.Alarm(this, 'RollbackAlarm', {
  alarmName: `kiro-pipeline-${environment}-rollbacks`,
  metric: new cloudwatch.Metric({
    namespace: 'KiroPipeline',
    metricName: 'RollbackCount',
    statistic: 'Sum',
    period: Duration.hours(1)
  }),
  threshold: 2,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
});

rollbackAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

### 9.4 Logging

**Log Groups**:
```typescript
const pipelineLogGroup = new logs.LogGroup(this, 'PipelineLogGroup', {
  logGroupName: `/aws/codepipeline/kiro-pipeline-${environment}`,
  retention: logs.RetentionDays.THREE_MONTHS,
  encryption: kmsKey
});

const rollbackLogGroup = new logs.LogGroup(this, 'RollbackLogGroup', {
  logGroupName: `/aws/lambda/kiro-pipeline-${environment}-rollback`,
  retention: logs.RetentionDays.THREE_MONTHS,
  encryption: kmsKey
});
```

**Structured Logging**:
```typescript
export class StructuredLogger {
  log(level: string, message: string, context: Record<string, any>): void {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    }));
  }
  
  info(message: string, context?: Record<string, any>): void {
    this.log('INFO', message, context || {});
  }
  
  error(message: string, error: Error, context?: Record<string, any>): void {
    this.log('ERROR', message, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      ...context
    });
  }
}
```

## 10. Security Considerations

### 10.1 IAM Permissions

**Pipeline Role**:
```typescript
const pipelineRole = new iam.Role(this, 'PipelineRole', {
  assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
  inlinePolicies: {
    'PipelinePolicy': new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'codebuild:BatchGetBuilds',
            'codebuild:StartBuild'
          ],
          resources: [buildProject.projectArn]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject'
          ],
          resources: [`${artifactsBucket.bucketArn}/*`]
        })
      ]
    })
  }
});
```

**CodeBuild Role**:
```typescript
const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
  assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
  inlinePolicies: {
    'BuildPolicy': new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          resources: [`arn:aws:logs:${region}:${account}:log-group:/aws/codebuild/*`]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue'
          ],
          resources: [
            `arn:aws:secretsmanager:${region}:${account}:secret:kiro-pipeline-*`
          ]
        })
      ]
    })
  }
});
```

**Rollback Lambda Role**:
```typescript
const rollbackRole = new iam.Role(this, 'RollbackRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  ],
  inlinePolicies: {
    'RollbackPolicy': new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'codepipeline:GetPipelineExecution',
            'codepipeline:StopPipelineExecution'
          ],
          resources: [pipeline.pipelineArn]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query'
          ],
          resources: [deploymentsTable.tableArn]
        })
      ]
    })
  }
});
```

### 10.2 Secrets Management

**GitHub Token**:
```typescript
const githubToken = secretsmanager.Secret.fromSecretNameV2(
  this,
  'GitHubToken',
  `kiro-pipeline-${environment}-github-token`
);

// Grant read access to CodeBuild
githubToken.grantRead(codeBuildRole);
```

**Encryption**:
```typescript
const kmsKey = new kms.Key(this, 'PipelineKey', {
  description: `KMS key for Kiro Pipeline ${environment}`,
  enableKeyRotation: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN
});

// Use for S3 encryption
const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
  encryption: s3.BucketEncryption.KMS,
  encryptionKey: kmsKey
});

// Use for log encryption
const logGroup = new logs.LogGroup(this, 'LogGroup', {
  encryption: logs.LogGroupEncryption.KMS,
  encryptionKey: kmsKey
});
```

### 10.3 Network Security

**VPC Configuration** (optional):
```typescript
const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
  vpcId: config.vpcId
});

const securityGroup = new ec2.SecurityGroup(this, 'BuildSecurityGroup', {
  vpc,
  description: 'Security group for CodeBuild projects',
  allowAllOutbound: true
});

const buildProject = new codebuild.Project(this, 'BuildProject', {
  vpc,
  subnetSelection: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
  },
  securityGroups: [securityGroup]
});
```

## 11. Performance Considerations

### 11.1 Optimization Strategies

**Build Caching**:
- Cache node_modules between builds
- Cache Docker layers
- Cache CDK synthesis output

**Parallel Execution**:
- Run unit tests in parallel
- Run security scans concurrently with tests
- Deploy test and staging environments in parallel (future enhancement)

**Artifact Management**:
- Compress artifacts before upload
- Use S3 Transfer Acceleration for large artifacts
- Implement lifecycle policies to reduce storage costs

### 11.2 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Total pipeline duration | < 60 minutes | TBD |
| Build stage | < 10 minutes | TBD |
| Test environment deployment | < 15 minutes | TBD |
| Staging environment deployment | < 15 minutes | TBD |
| Production deployment | < 15 minutes | TBD |
| Rollback execution | < 15 minutes | TBD |

## 12. Correctness Properties

### Property 1: Deployment Ordering
**Statement**: Deployments must always proceed in order: test → staging → production

**Validation**: 
```typescript
it('should enforce deployment order', () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom('test', 'staging', 'production')),
      async (environments) => {
        const deploymentOrder = await getDeploymentOrder();
        
        // Test must come before staging
        const testIndex = deploymentOrder.indexOf('test');
        const stagingIndex = deploymentOrder.indexOf('staging');
        const prodIndex = deploymentOrder.indexOf('production');
        
        return testIndex < stagingIndex && stagingIndex < prodIndex;
      }
    )
  );
});
```

**Validates**: Requirements US-1 (Acceptance Criteria 2)

### Property 2: Rollback Idempotency
**Statement**: Executing rollback multiple times for the same deployment produces the same result

**Validation**:
```typescript
it('should be idempotent when rolling back same deployment', () => {
  fc.assert(
    fc.asyncProperty(
      fc.record({
        deploymentId: fc.string(),
        environment: fc.constantFrom('test', 'staging', 'production'),
        version: fc.hexaString({ minLength: 40, maxLength: 40 })
      }),
      async (deployment) => {
        const result1 = await rollbackOrchestrator.executeRollback(deployment, 'test');
        const result2 = await rollbackOrchestrator.executeRollback(deployment, 'test');
        
        return result1.success === result2.success &&
               result1.level === result2.level;
      }
    )
  );
});
```

**Validates**: Requirements US-5 (Acceptance Criteria 8)

### Property 3: Test Coverage Threshold
**Statement**: Deployments must not proceed if code coverage is below 80%

**Validation**:
```typescript
it('should block deployment when coverage is below threshold', () => {
  fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 100 }),
      async (coveragePercentage) => {
        const testResults = { coveragePercentage };
        const shouldProceed = await deploymentValidator.validateTestResults(testResults);
        
        if (coveragePercentage < 80) {
          return !shouldProceed;
        }
        return shouldProceed;
      }
    )
  );
});
```

**Validates**: Requirements US-2 (Acceptance Criteria 6)

### Property 4: Alarm-Triggered Rollback
**Statement**: Any alarm in ALARM state during deployment must trigger rollback

**Validation**:
```typescript
it('should trigger rollback when any alarm enters ALARM state', () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        name: fc.string(),
        state: fc.constantFrom('OK', 'ALARM', 'INSUFFICIENT_DATA')
      })),
      async (alarms) => {
        const hasAlarm = alarms.some(a => a.state === 'ALARM');
        const rollbackTriggered = await monitorAlarms(alarms);
        
        return hasAlarm === rollbackTriggered;
      }
    )
  );
});
```

**Validates**: Requirements US-4 (Acceptance Criteria 4)

### Property 5: Security Scan Blocking
**Statement**: CRITICAL or HIGH severity security issues must block deployment

**Validation**:
```typescript
it('should block deployment for critical or high severity issues', () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        severity: fc.constantFrom('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
        description: fc.string()
      })),
      async (vulnerabilities) => {
        const hasCriticalOrHigh = vulnerabilities.some(
          v => v.severity === 'CRITICAL' || v.severity === 'HIGH'
        );
        const deploymentBlocked = await securityScanner.shouldBlockDeployment(vulnerabilities);
        
        return hasCriticalOrHigh === deploymentBlocked;
      }
    )
  );
});
```

**Validates**: Requirements US-3 (Acceptance Criteria 5)

### Property 6: Deployment State Consistency
**Statement**: Deployment records in DynamoDB must always reflect actual pipeline state

**Validation**:
```typescript
it('should maintain consistent deployment state', () => {
  fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        operation: fc.constantFrom('start', 'update', 'complete', 'fail'),
        deploymentId: fc.string(),
        status: fc.constantFrom('in_progress', 'succeeded', 'failed')
      })),
      async (operations) => {
        for (const op of operations) {
          await stateManager.performOperation(op);
        }
        
        const dbState = await stateManager.getDeploymentState();
        const pipelineState = await getPipelineState();
        
        return dbState.status === pipelineState.status;
      }
    )
  );
});
```

**Validates**: Requirements TR-6 (Rollback validation)

### Property 7: Notification Delivery
**Statement**: All deployment events must generate corresponding notifications

**Validation**:
```typescript
it('should send notification for every deployment event', () => {
  fc.assert(
    fc.asyncProperty(
      fc.constantFrom('start', 'success', 'failure', 'rollback'),
      async (eventType) => {
        await triggerDeploymentEvent(eventType);
        const notifications = await getNotifications();
        
        return notifications.some(n => n.eventType === eventType);
      }
    )
  );
});
```

**Validates**: Requirements US-6 (All acceptance criteria)

## 13. Open Questions and Future Enhancements

### 13.1 Open Questions

1. **Hotfix Deployments**: Should we support hotfix deployments that skip test/staging environments?
   - **Consideration**: Emergency fixes may need faster path to production
   - **Risk**: Bypassing validation stages increases risk
   - **Recommendation**: Implement with additional approval gates and post-deployment monitoring

2. **Deployment Windows**: Should we implement deployment windows (e.g., no production deploys on Friday)?
   - **Consideration**: Reduces risk of weekend incidents
   - **Risk**: May slow down critical fixes
   - **Recommendation**: Implement configurable deployment windows with override capability

3. **Database Migrations**: How should we handle database migrations during rollback?
   - **Consideration**: Schema changes may not be reversible
   - **Risk**: Rollback may fail if schema is incompatible
   - **Recommendation**: Implement forward-compatible migrations and separate migration rollback logic

4. **Cross-Environment Dependencies**: How do we handle services that depend on resources in other environments?
   - **Consideration**: Test environment may need to call staging APIs
   - **Risk**: Environment isolation may be compromised
   - **Recommendation**: Use service mocking or dedicated integration environment

### 13.2 Future Enhancements

**Blue/Green Deployments**:
- Deploy new version alongside old version
- Switch traffic gradually
- Instant rollback by switching traffic back
- **Benefit**: Zero-downtime deployments
- **Complexity**: Requires duplicate infrastructure

**Canary Deployments**:
- Deploy to small percentage of users first
- Monitor metrics and gradually increase traffic
- Automatic rollback if metrics degrade
- **Benefit**: Reduced blast radius
- **Complexity**: Requires traffic splitting and metric analysis

**Multi-Region Deployments**:
- Deploy to multiple AWS regions
- Region-specific rollback
- Cross-region health checks
- **Benefit**: Global availability
- **Complexity**: Significantly more complex orchestration

**Progressive Delivery**:
- Feature flags integration
- A/B testing support
- Gradual feature rollout
- **Benefit**: Decouple deployment from release
- **Complexity**: Requires feature flag infrastructure

**Automated Performance Testing**:
- Load testing in staging
- Performance regression detection
- Automatic rollback on performance degradation
- **Benefit**: Catch performance issues before production
- **Complexity**: Requires performance baseline and testing infrastructure

## 14. Success Criteria

The CD pipeline implementation will be considered successful when:

1. ✅ Pipeline automatically deploys changes from main branch to all environments
2. ✅ All tests (unit, integration, E2E) run and pass before deployment
3. ✅ Security scans block deployment when critical issues are found
4. ✅ Manual approval gate prevents unauthorized production deployments
5. ✅ Automated rollback triggers on test failures and alarm state changes
6. ✅ Deployment notifications are sent for all events
7. ✅ Infrastructure changes are detected and deployed only when necessary
8. ✅ Pipeline execution completes in < 60 minutes
9. ✅ Rollback completes in < 15 minutes
10. ✅ All correctness properties pass property-based tests
11. ✅ Code coverage ≥ 80% for all pipeline components
12. ✅ CloudWatch dashboard shows pipeline health metrics
13. ✅ Deployment history is tracked in DynamoDB
14. ✅ All IAM permissions follow least privilege principle

## 15. Conclusion

This design provides a comprehensive CD pipeline solution that balances automation with safety. The sequential deployment strategy with automated rollback ensures that issues are caught early and resolved quickly, minimizing risk to production environments.

### Key Design Strengths

**Progressive Validation**: The pipeline validates changes at each stage (test → staging → production), ensuring that only thoroughly tested code reaches production. Each environment acts as a quality gate with increasing levels of scrutiny.

**Automated Recovery**: The automated rollback system provides fast recovery from failures without manual intervention. By monitoring CloudWatch alarms and test results, the system can detect and respond to issues within minutes.

**Infrastructure Change Detection**: The intelligent detection of infrastructure changes prevents unnecessary CDK deployments, reducing deployment time and complexity when only application code changes.

**Comprehensive Security**: Multiple layers of security scanning (cfn-guard, cfn-lint, npm audit) combined with least privilege IAM permissions and encryption at rest ensure that security is built into every aspect of the pipeline.

**Observable and Auditable**: Complete observability through CloudWatch dashboards, structured logging, and DynamoDB deployment history ensures that every deployment is tracked and can be analyzed. The 90-day retention policy balances auditability with cost management.

**Property-Based Testing**: The use of property-based testing for critical correctness properties (deployment ordering, rollback idempotency, coverage thresholds, etc.) provides mathematical confidence that the system behaves correctly across all possible inputs, not just specific test cases.

### Implementation Approach

The implementation follows a phased approach that builds complexity incrementally:

1. **Phase 1-2**: Core infrastructure and pipeline structure
2. **Phase 3-4**: Deployment state management and monitoring
3. **Phase 5-6**: Automated rollback and notifications
4. **Phase 7-8**: Error handling and utilities
5. **Phase 9-10**: Property-based and integration tests
6. **Phase 11-13**: Deployment, documentation, and validation

This phased approach ensures that each component is thoroughly tested before moving to the next, reducing integration issues and enabling early feedback.

### Risk Mitigation

The design addresses key risks through multiple mechanisms:

- **Deployment Failures**: Automated rollback with stage-level and full rollback strategies
- **Security Vulnerabilities**: Multi-layer security scanning with deployment blocking
- **Performance Issues**: Caching, parallel execution, and performance monitoring
- **Operational Complexity**: Comprehensive documentation, runbooks, and monitoring dashboards
- **Data Loss**: Point-in-time recovery for DynamoDB, versioned S3 buckets, and idempotent operations

### Alignment with Requirements

This design fully addresses all requirements specified in the requirements document:

- **User Stories (US-1 through US-8)**: All user stories are implemented with corresponding acceptance criteria validated through tests
- **Technical Requirements (TR-1 through TR-8)**: All technical requirements are met with specific implementation details
- **Non-Functional Requirements (NFR-1 through NFR-4)**: Reliability, security, observability, and maintainability are built into the architecture
- **Success Metrics**: The design enables measurement of all specified success metrics (deployment frequency, lead time, MTTR, change failure rate)

### Next Steps

With this design approved, the implementation can proceed according to the task list in `tasks.md`. The phased approach ensures that each component is built, tested, and validated before integration, minimizing risk and enabling early detection of issues.

The CD pipeline will transform the Kiro CodeBuild Worker deployment process from manual to fully automated, reducing deployment time from hours to minutes while increasing reliability and safety through automated testing, security scanning, and rollback capabilities. structured logging, and DynamoDB deployment history provides full visibility into pipeline operations and enables effective troubleshooting.

### Implementation Considerations

The implementation should proceed in phases as outlined in the tasks document, starting with core infrastructure and building up to the complete pipeline. Each phase should be thoroughly tested before proceeding to the next.

Property-based testing is critical for validating correctness properties that must hold across all possible inputs. These tests provide confidence that the pipeline behaves correctly under all conditions, not just the specific scenarios covered by example-based tests.

The design prioritizes reliability and safety over speed. While the target of 60 minutes for full deployment may seem long, this includes comprehensive testing, security scanning, and progressive validation across three environments. This trade-off is intentional and appropriate for production systems where correctness is paramount.

### Future Evolution

The design includes several future enhancements (blue/green deployments, canary releases, multi-region support) that can be added incrementally without major architectural changes. The modular design with clear separation of concerns makes these enhancements feasible.

As the system matures and gains operational experience, performance optimizations can be applied (parallel environment deployments, faster test execution, improved caching) while maintaining the core safety guarantees.

### Success Metrics

The pipeline will be considered successful when it achieves:
- **Deployment frequency**: Multiple deployments per day
- **Lead time**: < 2 hours from commit to production
- **MTTR**: < 15 minutes via automated rollback
- **Change failure rate**: < 5%
- **Deployment success rate**: ≥ 95%

These metrics align with industry best practices for high-performing DevOps teams and provide measurable goals for continuous improvement.e caught early and resolved quickly. The integration of comprehensive testing, security scanning, and monitoring creates multiple layers of protection against deployment failures.

Key strengths of this design:

1. **Progressive Validation**: Sequential environment deployment (test → staging → production) provides multiple validation gates
2. **Automated Recovery**: Multi-level rollback system (stage-level and full) ensures rapid recovery from failures
3. **Comprehensive Testing**: Unit, integration, and E2E tests with 80% coverage requirement ensure code quality
4. **Security First**: Multiple security scanning tools (cfn-guard, cfn-lint, npm audit) prevent vulnerable code from reaching production
5. **Full Observability**: CloudWatch integration, custom metrics, and structured logging provide complete visibility
6. **Infrastructure Optimization**: Smart infrastructure change detection prevents unnecessary CDK deployments
7. **Formal Correctness**: Property-based tests validate critical system properties

The design addresses all requirements from the requirements document and provides a solid foundation for reliable, automated deployments. Future enhancements like blue/green deployments and canary releases can be added incrementally without major architectural changes.ration with monitoring systems provides real-time visibility into deployment health, while the property-based testing approach ensures correctness of critical pipeline logic.

The modular architecture allows for future enhancements such as blue/green deployments and canary releases without requiring a complete redesign. The use of AWS-native services (CodePipeline, CodeBuild, EventBridge) ensures reliability and maintainability while keeping operational overhead low.

