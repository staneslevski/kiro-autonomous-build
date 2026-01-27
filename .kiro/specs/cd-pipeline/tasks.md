# CD Pipeline with Automated Deployment and Rollback - Implementation Tasks

## Overview

This task list implements a CD pipeline for the Kiro CodeBuild Worker project. The pipeline will automatically deploy infrastructure and application changes through test → staging → production environments with comprehensive testing, security scanning, monitoring, and automated rollback capabilities.

**Important Notes:**
- This is a NEW feature being added to the existing Kiro CodeBuild Worker project
- Existing infrastructure stacks (core, secrets, monitoring, codebuild) already exist and should be extended where appropriate
- The existing buildspec.yml is for the Kiro Worker application itself, not the CD pipeline
- All tasks must achieve ≥80% code coverage and all tests must pass
- Follow TypeScript and AWS CDK standards from steering documentation

## Phase 1: Core Infrastructure and Type Definitions

### 1. Type Definitions
- [ ] 1.1 Create `infrastructure/lib/types/` directory and type definition files
  - Create `infrastructure/lib/types/pipeline-types.ts` with DeploymentRecord, Environment, DeploymentStatus, RollbackLevel, HealthCheckResult, AlarmInfo, TestResults, SecurityViolation, FailedTest interfaces
  - Create `infrastructure/lib/types/pipeline-config.ts` with PipelineConfig, PipelineEnvironmentConfig, BuildConfig, MonitoringConfig interfaces
  - Create `infrastructure/lib/types/index.ts` to export all types
  - **Validates**: Design Section 4, TR-2

- [ ] 1.2 Write unit tests for type definitions
  - Create `infrastructure/test/types/pipeline-types.test.ts`
  - Test type guards and validation functions if any
  - Test type compatibility and structure
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 2. Environment Configuration Extension
- [ ] 2.1 Extend `infrastructure/lib/config/environments.ts` with CD pipeline configuration
  - Add pipeline-specific fields to EnvironmentConfig interface (githubOwner, githubRepo, healthCheckDuration, alarmPrefixes, pipelineEnabled)
  - Update test environment with pipeline settings (healthCheckDuration: 5 minutes, pipelineEnabled: true)
  - Update staging environment with pipeline settings (healthCheckDuration: 5 minutes, pipelineEnabled: true)
  - Update production environment with stricter settings (healthCheckDuration: 10 minutes, pipelineEnabled: true)
  - **Validates**: TR-2

- [ ] 2.2 Update environment configuration tests
  - Update `infrastructure/test/config/environments.test.ts` to test new pipeline fields
  - Test that all environments have required pipeline configuration
  - Test validation of pipeline-specific fields
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 3. CD Pipeline Core Infrastructure Stack
- [ ] 3.1 Create `infrastructure/lib/stacks/cd-pipeline-core-stack.ts`
  - Create S3 artifacts bucket for pipeline with encryption (KMS), versioning, lifecycle policies (90 day expiration, 30 day IA transition), and public access blocked
  - Create DynamoDB deployments table with partition key (deploymentId), TTL attribute (expiresAt), GSI (EnvironmentStatusIndex with environment as PK and status as SK), point-in-time recovery, and encryption
  - Create KMS encryption key with rotation enabled for pipeline resources
  - Create CloudWatch log groups for pipeline (/aws/codepipeline/kiro-pipeline-{env}) and rollback (/aws/lambda/kiro-pipeline-{env}-rollback) with 90-day retention
  - Export stack outputs (artifactsBucketArn, artifactsBucketName, deploymentsTableName, deploymentsTableArn, kmsKeyArn, pipelineLogGroupName, rollbackLogGroupName)
  - **Validates**: TR-1, TR-5, NFR-2

- [ ] 3.2 Write unit tests for CD Pipeline Core Infrastructure Stack
  - Create `infrastructure/test/stacks/cd-pipeline-core-stack.test.ts`
  - Test S3 bucket has KMS encryption, versioning, lifecycle rules, and public access blocked
  - Test DynamoDB table has TTL, GSI, point-in-time recovery, and encryption
  - Test KMS key has rotation enabled
  - Test CloudWatch log groups have correct retention and encryption
  - Test stack outputs are exported correctly
  - Verify snapshot matches expected resources
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 2: Pipeline Infrastructure

### 4. Pipeline Stack
- [ ] 4.1 Create `infrastructure/lib/stacks/cd-pipeline-stack.ts`
  - Import core stack outputs (artifacts bucket, deployments table, KMS key)
  - Create CodePipeline with 5 stages: Source, Build, TestEnv, StagingEnv, ProductionEnv
  - Configure GitHub source action with webhook trigger and OAuth token from Secrets Manager
  - Create source output artifact
  - Create IAM role for pipeline with least privilege permissions (CodeBuild, S3, CloudWatch)
  - Configure artifact storage in S3 with encryption
  - Add manual approval action before production stage with SNS notification
  - Set pipeline timeout and retry settings
  - Export pipeline ARN and name
  - **Validates**: TR-1, US-1, US-6, NFR-2

- [ ] 4.2 Write unit tests for Pipeline Stack
  - Test pipeline has exactly 5 stages in correct order
  - Test source action configured with GitHub webhook trigger
  - Test source action uses Secrets Manager for OAuth token
  - Test manual approval action exists in production stage
  - Test manual approval has SNS topic configured
  - Test IAM role has least privilege permissions (no wildcard actions/resources)
  - Test artifacts stored in S3 with encryption
  - Verify snapshot matches expected resources
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 5. CodeBuild Projects for Pipeline
- [ ] 5.1 Create `infrastructure/lib/constructs/pipeline-codebuild-construct.ts`
  - Create reusable CodeBuild project construct for pipeline stages
  - Accept props (name, environment, buildSpec, artifacts bucket, role, environment variables)
  - Configure build environment (LinuxBuildImage.STANDARD_7_0, ComputeType.SMALL, Node.js 18)
  - Configure caching (SOURCE, DOCKER_LAYER, CUSTOM modes) with custom paths for node_modules
  - Configure logging to CloudWatch with log group and stream
  - Configure IAM role with required permissions (logs, S3, Secrets Manager)
  - Set timeout (60 minutes) and queued timeout (8 hours)
  - Export project ARN and name
  - **Validates**: TR-1, TR-8, NFR-2

- [ ] 5.2 Add pipeline-specific CodeBuild projects to Pipeline Stack
  - Create build stage CodeBuild project using PipelineCodeBuildConstruct with buildspec-build.yml
  - Create integration test CodeBuild project with buildspec-integration-test.yml
  - Create E2E test CodeBuild project with buildspec-e2e-test.yml
  - Create deployment CodeBuild projects for test, staging, and production with buildspec-deploy.yml
  - Configure environment variables for each project (ENVIRONMENT, COVERAGE_THRESHOLD, AWS_REGION, ACCOUNT_ID)
  - Configure test reports output (JUnit XML format)
  - Configure coverage reports output (Clover XML format)
  - Grant read access to GitHub token secret
  - Add projects to appropriate pipeline stages
  - **Validates**: TR-3, TR-4, US-1, US-2, US-3

- [ ] 5.3 Write unit tests for Pipeline CodeBuild Construct
  - Test build environment configuration (image, compute, runtime)
  - Test caching configuration (all 3 modes enabled, custom paths)
  - Test IAM permissions are least privilege (specific actions and resources)
  - Test logging configuration (log group, retention)
  - Test timeout settings (build and queued)
  - Verify construct creates project correctly with proper names
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 6. Buildspec Files
- [ ] 6.1 Create `buildspec-build.yml` in project root
  - Configure install phase (Node.js 18, npm ci for dependencies)
  - Configure pre_build phase (npm run lint, npm audit --audit-level=high, npm run test:coverage)
  - Configure build phase (npm run build, cd infrastructure && npm ci && npm run build, cdk synth)
  - Configure post_build phase (cfn-lint on cdk.out templates, cfn-guard validate with security-rules.guard)
  - Configure artifacts output (all files, named BuildArtifact)
  - Configure test reports (coverage/junit.xml as JUNITXML)
  - Configure coverage reports (coverage/coverage-final.json as CLOVERXML)
  - Configure cache paths (node_modules, infrastructure/node_modules, .npm)
  - **Validates**: TR-3, TR-4, US-2, US-3

- [ ] 6.2 Create `buildspec-integration-test.yml` in project root
  - Configure install phase (Node.js 18, restore dependencies from cache)
  - Configure build phase (npm run test:integration with environment variables)
  - Configure test reports output (test-results/integration-junit.xml as JUNITXML)
  - Configure timeout handling and error reporting
  - **Validates**: TR-3, US-2

- [ ] 6.3 Create `buildspec-e2e-test.yml` in project root
  - Configure install phase (Node.js 18, restore dependencies)
  - Configure build phase (npm run test:e2e with staging environment variables)
  - Configure test reports output (test-results/e2e-junit.xml as JUNITXML)
  - Configure timeout handling (30 minutes)
  - **Validates**: TR-3, US-2

- [ ] 6.4 Create `buildspec-deploy.yml` in project root
  - Configure install phase (Node.js 18, AWS CDK CLI)
  - Configure pre_build phase (detect infrastructure changes using git diff)
  - Configure build phase (cdk diff for change preview, conditional cdk deploy based on changes)
  - Configure post_build phase (verify deployment, update deployment record in DynamoDB)
  - Configure environment variables (ENVIRONMENT, AWS_REGION, ACCOUNT_ID, TABLE_NAME)
  - Include logic to skip deployment if no infrastructure changes detected
  - **Validates**: TR-1, US-1, US-7

### 7. Security Scanning Configuration
- [ ] 7.1 Create `infrastructure/security-rules.guard` in infrastructure directory
  - Define S3 bucket encryption rule (must have ServerSideEncryptionConfiguration with AES256 or aws:kms)
  - Define S3 bucket public access rule (all 4 BlockPublicAccess settings must be true)
  - Define DynamoDB encryption rule (SSESpecification.SSEEnabled must be true)
  - Define Lambda DLQ rule (DeadLetterConfig must exist)
  - Define IAM wildcard permissions rule (Action='*' or Resource='*' with Effect='Allow' not allowed)
  - Add comments explaining each rule and its security rationale
  - **Validates**: TR-4, US-3, NFR-2

- [ ] 7.2 Integrate security scanning in buildspec-build.yml
  - Install cfn-guard CLI (npm install -g @aws-guard/cfn-guard)
  - Install cfn-lint CLI (pip install cfn-lint)
  - Configure cfn-guard execution on all CloudFormation templates in cdk.out
  - Configure cfn-lint execution on all templates
  - Configure npm audit with --audit-level=high (fail on HIGH and CRITICAL)
  - Configure ESLint for TypeScript (already in npm run lint)
  - Ensure build fails if any security scan fails
  - **Validates**: TR-4, US-3

## Phase 3: Deployment State Management

### 8. Deployment State Manager
- [ ] 8.1 Create `infrastructure/lib/components/deployment-state-manager.ts`
  - Import AWS SDK v3 DynamoDB client (DynamoDBClient, PutItemCommand, UpdateItemCommand, QueryCommand)
  - Implement `recordDeploymentStart()` method that creates deployment record with all required fields
  - Implement `updateDeploymentStatus()` method that updates status, endTime, and test results
  - Implement `getLastKnownGoodDeployment()` method that queries GSI for succeeded deployments
  - Implement `getDeploymentHistory()` method that queries by environment with pagination
  - Use proper error handling with try-catch and custom errors
  - Calculate TTL as current timestamp + 90 days in seconds
  - **Validates**: Design Section 3.5, TR-6

- [ ] 8.2 Write unit tests for Deployment State Manager
  - Test recordDeploymentStart creates record with correct structure and TTL
  - Test updateDeploymentStatus updates status and timestamps correctly
  - Test updateDeploymentStatus updates test results when provided
  - Test getLastKnownGoodDeployment returns most recent succeeded deployment
  - Test getLastKnownGoodDeployment returns null when no succeeded deployments exist
  - Test getDeploymentHistory returns deployments in descending order
  - Test error handling for DynamoDB failures
  - Mock DynamoDB client using aws-sdk-client-mock
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 9. Infrastructure Change Detector
- [ ] 9.1 Create `infrastructure/lib/components/infrastructure-change-detector.ts`
  - Import simple-git for Git operations
  - Implement `detectChanges()` method that checks both file changes and CDK diff
  - Implement `getChangedFiles()` method using git diff between commits
  - Implement `runCdkDiff()` method that executes cdk diff and captures output
  - Implement `hasMeaningfulChanges()` method that parses diff for Resources/Parameters/Outputs
  - Filter for infrastructure files (infrastructure/**, buildspec.yml, cdk.json)
  - Ignore metadata-only changes (tags, descriptions without resource changes)
  - Return boolean indicating if deployment is needed
  - **Validates**: Design Section 3.2, US-7

- [ ] 9.2 Write unit tests for Infrastructure Change Detector
  - Test detectChanges returns true when infrastructure files changed
  - Test detectChanges returns false when only application files changed
  - Test detectChanges returns true when CDK diff shows resource changes
  - Test detectChanges returns false when CDK diff shows only metadata changes
  - Test getChangedFiles correctly identifies modified files
  - Test hasMeaningfulChanges correctly parses CDK diff output
  - Mock Git operations using vitest mocks
  - Mock child_process for CDK diff execution
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 4: Monitoring and Health Checks

### 10. Health Check Monitor
- [ ] 10.1 Create `infrastructure/lib/components/health-check-monitor.ts`
  - Import AWS SDK v3 CloudWatch client (CloudWatchClient, DescribeAlarmsCommand)
  - Implement `monitorHealthChecks()` method that monitors for specified duration (default 5 minutes)
  - Implement `checkAlarms()` method that queries CloudWatch for alarm states
  - Implement `runHealthChecks()` method that executes custom health check logic
  - Configure 30-second check interval using setTimeout/setInterval
  - Return HealthCheckResult with success flag and failed alarms array
  - Stop monitoring immediately if any alarm enters ALARM state
  - Use structured logging for all health check events
  - **Validates**: Design Section 3.3, TR-5, US-4

- [ ] 10.2 Write unit tests for Health Check Monitor
  - Test monitorHealthChecks runs for full duration when all alarms OK
  - Test monitorHealthChecks stops early when alarm enters ALARM state
  - Test checkAlarms correctly queries CloudWatch and parses response
  - Test checkAlarms handles empty alarm list
  - Test runHealthChecks executes and returns results
  - Test 30-second interval between checks
  - Mock CloudWatch client using aws-sdk-client-mock
  - Mock timers using vitest fake timers
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

- [ ] 10.3 Write property-based test for health check monotonicity
  - Implement Property 3: Health Check Monotonicity from design
  - Use fast-check to generate random durations and alarm states
  - Verify that once a check fails, it never succeeds in the same monitoring session
  - Test with various alarm state transition sequences
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 3

### 11. Monitoring Stack
- [ ] 11.1 Extend `infrastructure/lib/stacks/monitoring-alerting-stack.ts` with CD pipeline monitoring
  - Import pipeline ARN and deployments table from CD pipeline stacks
  - Create SNS topic for deployment notifications with email subscription
  - Create SNS topic for approval requests with email subscription
  - Create SNS topic for rollback notifications with email subscription
  - Create CloudWatch alarm for pipeline failures (threshold: 3 in 1 hour)
  - Create CloudWatch alarm for rollback count (threshold: 2 in 1 hour)
  - Create CloudWatch alarm for deployment duration (threshold: 60 minutes)
  - Add pipeline metrics widgets to existing CloudWatch dashboard (executions, duration, success rate)
  - Configure alarm actions to send to appropriate SNS topics
  - Export topic ARNs for use in other stacks
  - **Validates**: TR-5, US-4, US-6, NFR-3

- [ ] 11.2 Write unit tests for CD Pipeline Monitoring additions
  - Test all 3 new SNS topics created with correct names
  - Test SNS topics have email subscriptions configured
  - Test CloudWatch alarms created with correct thresholds
  - Test alarm for pipeline failures (3 failures in 1 hour)
  - Test alarm for rollbacks (2 rollbacks in 1 hour)
  - Test alarm for deployment duration (> 60 minutes)
  - Test alarms have SNS actions configured
  - Test dashboard has pipeline metrics widgets
  - Verify snapshot matches expected resources
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 12. Pipeline Metrics Publisher
- [ ] 12.1 Create `infrastructure/lib/components/pipeline-metrics.ts`
  - Import AWS SDK v3 CloudWatch client (CloudWatchClient, PutMetricDataCommand)
  - Implement `publishDeploymentDuration()` method with environment dimension
  - Implement `publishRollback()` method with environment and level dimensions
  - Implement `publishTestResults()` method with test type dimension
  - Use custom namespace 'KiroPipeline' for all metrics
  - Include timestamp with each metric data point
  - Use appropriate units (Seconds, Count, Percent)
  - Handle errors gracefully (log but don't fail deployment)
  - **Validates**: Design Section 9.2, TR-5, NFR-3

- [ ] 12.2 Write unit tests for Pipeline Metrics
  - Test publishDeploymentDuration sends correct metric with dimensions
  - Test publishRollback sends metric with environment and level dimensions
  - Test publishTestResults calculates and sends success rate percentage
  - Test metric namespace is 'KiroPipeline'
  - Test correct units used for each metric type
  - Test error handling when CloudWatch API fails
  - Mock CloudWatch client using aws-sdk-client-mock
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 5: Automated Rollback System

### 13. Rollback Orchestrator
- [ ] 13.1 Create `infrastructure/lib/components/rollback-orchestrator.ts`
  - Import AWS SDK v3 clients (CodePipelineClient, SNSClient)
  - Import DeploymentStateManager and NotificationService
  - Implement `executeRollback()` method that orchestrates full rollback flow
  - Implement `rollbackStage()` method for single environment rollback
  - Implement `rollbackFull()` method for all environments rollback
  - Implement `validateRollback()` method that checks alarms and health
  - Implement `recordRollbackStart()`, `recordRollbackSuccess()`, `recordRollbackFailure()` methods
  - Use try-catch for error handling with fallback to full rollback
  - Send notifications at each rollback stage
  - Return RollbackResult with success flag and level
  - **Validates**: Design Section 3.4, TR-6, US-5

- [ ] 13.2 Write unit tests for Rollback Orchestrator
  - Test executeRollback performs stage-level rollback first
  - Test executeRollback falls back to full rollback when stage rollback fails
  - Test rollbackStage reverts infrastructure and application
  - Test rollbackFull reverts all environments in correct order
  - Test validateRollback checks alarms and health
  - Test rollback state recording in DynamoDB
  - Test notification sending at each stage
  - Test error handling and fallback logic
  - Mock CodePipeline, DynamoDB, SNS clients
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

- [ ] 13.3 Write property-based test for rollback idempotency
  - Implement Property 2: Rollback Idempotency from design
  - Use fast-check to generate random deployment states
  - Verify executing rollback multiple times produces same result
  - Test with various deployment configurations
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 2

### 14. Rollback Lambda Function
- [ ] 14.1 Create `infrastructure/lib/lambda/rollback-handler.ts`
  - Implement Lambda handler function that processes EventBridge events
  - Implement `AlarmEventProcessor` class with processAlarmEvent method
  - Parse CloudWatch alarm event from EventBridge
  - Check if alarm is deployment-related (matches environment prefix)
  - Query DynamoDB for current active deployment
  - Integrate with RollbackOrchestrator to trigger rollback
  - Configure structured logging with context
  - Handle errors and send to DLQ
  - Return success/failure response
  - **Validates**: Design Section 5.1, TR-6, US-5

- [ ] 14.2 Add rollback Lambda to CD Pipeline Monitoring Stack
  - Create Lambda function with rollback-handler code in monitoring stack
  - Configure IAM role with permissions (CodePipeline, DynamoDB, SNS, CloudWatch Logs)
  - Configure environment variables (TABLE_NAME, PIPELINE_ARN, TOPIC_ARN)
  - Configure timeout (15 minutes)
  - Configure memory size (512 MB)
  - Configure DLQ for failed invocations
  - Configure retry attempts (0 - handle retries in code)
  - Grant permissions to read from deployments table
  - **Validates**: TR-6, US-5, NFR-2

- [ ] 14.3 Create EventBridge rule for alarm state changes in Monitoring Stack
  - Create EventBridge rule for CD pipeline alarms
  - Configure event pattern to match CloudWatch alarm state changes
  - Filter for source: 'aws.cloudwatch'
  - Filter for detailType: 'CloudWatch Alarm State Change'
  - Filter for alarmName prefix matching CD pipeline alarms
  - Filter for state.value: 'ALARM'
  - Add rollback Lambda as target
  - Configure input transformation if needed
  - **Validates**: TR-5, US-4, US-5

- [ ] 14.4 Write unit tests for Rollback Lambda
  - Test handler processes alarm events correctly
  - Test AlarmEventProcessor filters deployment-related alarms
  - Test AlarmEventProcessor ignores non-deployment alarms
  - Test rollback triggering for valid alarm events
  - Test error handling for missing deployment
  - Test error handling for rollback failures
  - Mock EventBridge events with various alarm states
  - Mock DynamoDB and CodePipeline clients
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 15. Rollback Validator
- [ ] 15.1 Create `infrastructure/lib/components/rollback-validator.ts`
  - Import CloudWatch client and HealthCheckMonitor
  - Implement `validateRollback()` method that performs full validation
  - Implement alarm state checking (all alarms must be OK)
  - Implement health check execution (must pass)
  - Implement version verification (deployed version matches target)
  - Configure 1-minute stabilization wait before validation
  - Return ValidationResult with success flag and reason
  - Use structured logging for validation steps
  - **Validates**: Design Section 3.4.3, TR-6

- [ ] 15.2 Write unit tests for Rollback Validator
  - Test validateRollback succeeds when all checks pass
  - Test validateRollback fails when alarms still in ALARM state
  - Test validateRollback fails when health checks fail
  - Test validateRollback fails when version doesn't match
  - Test 1-minute stabilization wait occurs
  - Test validation result includes failure reason
  - Mock CloudWatch and health check clients
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 6: Notification System

### 16. Notification Service
- [ ] 16.1 Create `infrastructure/lib/components/notification-service.ts`
  - Import AWS SDK v3 SNS client (SNSClient, PublishCommand)
  - Implement `notifyDeploymentStart()` method with deployment details
  - Implement `notifyDeploymentSuccess()` method with duration and test results
  - Implement `notifyDeploymentFailure()` method with error details
  - Implement `notifyRollbackInitiated()` method with reason and level
  - Implement `notifyRollbackSuccess()` method with validation results
  - Implement `notifyRollbackFailure()` method with error details
  - Format all messages as JSON with event type, timestamp, and relevant data
  - Include environment, version, and execution ID in all messages
  - Handle SNS publish errors gracefully (log but don't fail)
  - **Validates**: Design Section 3.6, US-6

- [ ] 16.2 Write unit tests for Notification Service
  - Test notifyDeploymentStart sends correct message format
  - Test notifyDeploymentSuccess includes duration and test results
  - Test notifyDeploymentFailure includes error details
  - Test notifyRollbackInitiated includes reason and level
  - Test notifyRollbackSuccess includes validation results
  - Test notifyRollbackFailure includes error details
  - Test all messages are valid JSON
  - Test error handling when SNS publish fails
  - Mock SNS client using aws-sdk-client-mock
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

- [ ] 16.3 Write property-based test for notification delivery
  - Implement Property 7: Notification Delivery from design
  - Use fast-check to generate random deployment events
  - Verify notification sent for every deployment event type
  - Test with various event combinations
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 7

### 17. Slack Integration (Optional)
- [ ] 17.1* Create `infrastructure/lib/lambda/slack-notifier.ts`
  - Implement Lambda handler that processes SNS events
  - Parse SNS message JSON
  - Format messages for Slack with appropriate formatting (blocks, attachments)
  - Include color coding (green for success, red for failure, yellow for warnings)
  - Send to Slack webhook URL from Secrets Manager
  - Handle HTTP errors gracefully
  - Log all Slack notifications
  - **Validates**: US-6

- [ ] 17.2* Write unit tests for Slack Notifier
  - Test SNS event parsing
  - Test Slack message formatting for each event type
  - Test color coding for different event types
  - Test webhook URL retrieval from Secrets Manager
  - Test webhook invocation with correct payload
  - Test error handling for HTTP failures
  - Mock HTTP client (node-fetch or axios)
  - Mock Secrets Manager client
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 7: Error Handling and Custom Errors

### 18. Custom Error Classes
- [ ] 18.1 Create `infrastructure/lib/errors/pipeline-error.ts`
  - Implement `PipelineError` class extending Error
  - Include stage property (string)
  - Include cause property (optional Error)
  - Set name to 'PipelineError'
  - Call super with message
  - Export class
  - **Validates**: Design Section 6.1

- [ ] 18.2 Create `infrastructure/lib/errors/rollback-error.ts`
  - Implement `RollbackError` class extending Error
  - Include deployment property (Deployment object)
  - Include cause property (optional Error)
  - Set name to 'RollbackError'
  - Call super with message
  - Export class
  - **Validates**: Design Section 6.1

- [ ] 18.3 Create `infrastructure/lib/errors/health-check-error.ts`
  - Implement `HealthCheckError` class extending Error
  - Include failedAlarms property (AlarmInfo array)
  - Include cause property (optional Error)
  - Set name to 'HealthCheckError'
  - Call super with message
  - Export class
  - **Validates**: Design Section 6.1

- [ ] 18.4 Create `infrastructure/lib/errors/security-scan-error.ts`
  - Implement `SecurityScanError` class extending Error
  - Include violations property (SecurityViolation array)
  - Include cause property (optional Error)
  - Set name to 'SecurityScanError'
  - Call super with message
  - Export class
  - **Validates**: Design Section 6.1

- [ ] 18.5 Create `infrastructure/lib/errors/index.ts`
  - Export PipelineError
  - Export RollbackError
  - Export HealthCheckError
  - Export SecurityScanError
  - **Validates**: Design Section 6.1

- [ ] 18.6 Write unit tests for custom errors
  - Test PipelineError instantiation with stage and cause
  - Test RollbackError instantiation with deployment and cause
  - Test HealthCheckError instantiation with failedAlarms and cause
  - Test SecurityScanError instantiation with violations and cause
  - Test error name property is set correctly
  - Test error message is set correctly
  - Test error inheritance from Error
  - Test error properties are accessible
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 8: Utility Functions

### 19. Structured Logger
- [ ] 19.1 Create `infrastructure/lib/utils/structured-logger.ts`
  - Implement `StructuredLogger` class
  - Implement `log()` method that outputs JSON with timestamp, level, message, context
  - Implement `info()` method that calls log with 'INFO' level
  - Implement `error()` method that calls log with 'ERROR' level and serializes error
  - Implement `warn()` method that calls log with 'WARN' level
  - Format timestamp as ISO 8601 string
  - Serialize error objects with name, message, stack
  - Use console.log for output (CloudWatch will capture)
  - Export class
  - **Validates**: Design Section 9.4, NFR-3

- [ ] 19.2 Write unit tests for Structured Logger
  - Test log() formats output as JSON
  - Test log() includes timestamp, level, message, context
  - Test info() calls log with INFO level
  - Test error() calls log with ERROR level and serializes error
  - Test warn() calls log with WARN level
  - Test error serialization includes name, message, stack
  - Test context is merged into log output
  - Mock console.log to verify output
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 20. Retry Utility
- [ ] 20.1 Create `infrastructure/lib/utils/retry.ts`
  - Implement `retry()` function with exponential backoff
  - Accept operation function, maxAttempts, initialDelay, maxDelay, backoffMultiplier
  - Configure defaults: maxAttempts=3, initialDelay=1000ms, maxDelay=10000ms, multiplier=2
  - Implement exponential backoff: delay = min(initialDelay * (multiplier ^ attempt), maxDelay)
  - Catch errors and retry until maxAttempts reached
  - Throw last error if all attempts fail
  - Log each retry attempt with delay
  - Export function
  - **Validates**: Design Section 6.2, NFR-1

- [ ] 20.2 Write unit tests for Retry Utility
  - Test successful retry after 1 failure
  - Test successful retry after 2 failures
  - Test exhausting max attempts (3) and throwing error
  - Test immediate success (no retries)
  - Test exponential backoff timing (1s, 2s, 4s)
  - Test max delay cap is enforced
  - Test retry with custom parameters
  - Mock operation function with controlled failures
  - Use vitest fake timers for timing tests
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

## Phase 9: Property-Based Tests

### 21. Core Property Tests
- [ ] 21.1 Write property test for deployment ordering
  - Implement Property 1: Deployment Ordering from design
  - Create test file `infrastructure/test/properties/deployment-ordering.test.ts`
  - Use fast-check to generate random environment sequences
  - Verify test always comes before staging, staging before production
  - Test with fc.array and fc.constantFrom for environments
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 1, US-1

- [ ] 21.2 Write property test for test coverage threshold
  - Implement Property 3: Test Coverage Threshold from design
  - Create test file `infrastructure/test/properties/coverage-threshold.test.ts`
  - Use fast-check to generate random coverage percentages (0-100)
  - Verify deployment blocked when coverage < 80%
  - Verify deployment allowed when coverage >= 80%
  - Test with fc.integer({ min: 0, max: 100 })
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 3, US-2

- [ ] 21.3 Write property test for alarm-triggered rollback
  - Implement Property 4: Alarm-Triggered Rollback from design
  - Create test file `infrastructure/test/properties/alarm-rollback.test.ts`
  - Use fast-check to generate random alarm states
  - Verify rollback triggered when any alarm in ALARM state
  - Verify no rollback when all alarms OK or INSUFFICIENT_DATA
  - Test with fc.array of alarm objects with state property
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 4, US-4

- [ ] 21.4 Write property test for security scan blocking
  - Implement Property 5: Security Scan Blocking from design
  - Create test file `infrastructure/test/properties/security-blocking.test.ts`
  - Use fast-check to generate random vulnerability arrays
  - Verify deployment blocked for CRITICAL or HIGH severity
  - Verify deployment allowed for only MEDIUM or LOW severity
  - Test with fc.array of vulnerability objects with severity property
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 5, US-3

- [ ] 21.5 Write property test for deployment state consistency
  - Implement Property 6: Deployment State Consistency from design
  - Create test file `infrastructure/test/properties/state-consistency.test.ts`
  - Use fast-check to generate random deployment operations
  - Verify DynamoDB state always matches pipeline state
  - Test with fc.array of operation objects (start, update, complete, fail)
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 6, TR-6

## Phase 10: Integration Tests

### 22. Pipeline Integration Tests
- [ ] 22.1 Create `infrastructure/test/integration/pipeline-integration.test.ts`
  - Test full pipeline execution from source to production
  - Test pipeline with infrastructure changes (triggers CDK deploy)
  - Test pipeline with application-only changes (skips CDK deploy)
  - Test test failure triggers rollback
  - Test alarm triggers rollback via EventBridge
  - Test manual approval timeout behavior
  - Use real AWS SDK clients with test environment
  - Clean up resources after each test
  - Mark as integration test with test.skip() for unit test runs
  - **Validates**: Design Section 7.2, NFR-1

- [ ] 22.2 Create integration test helpers in same file
  - Implement `triggerPipeline()` helper that starts pipeline execution
  - Implement `waitForStageCompletion()` helper that polls stage status
  - Implement `getTestResults()` helper that retrieves test reports
  - Implement `approveProductionDeployment()` helper that approves manual gate
  - Implement `getDeploymentRecord()` helper that queries DynamoDB
  - Implement `cleanupTestResources()` helper that removes test data
  - Use AWS SDK v3 clients (CodePipeline, DynamoDB, CodeBuild)
  - **Validates**: Design Section 7.2

## Phase 11: Deployment and Configuration

### 23. CDK App Entry Point
- [ ] 23.1 Create `infrastructure/bin/cd-pipeline.ts` or extend existing bin file
  - Initialize CDK app with `new cdk.App()`
  - Load environment from context: `app.node.tryGetContext('environment')`
  - Load environment configuration from existing ENVIRONMENTS constant
  - Instantiate CD Pipeline Core Infrastructure Stack with environment config
  - Instantiate CD Pipeline Stack with dependencies (artifacts bucket, deployments table, KMS key)
  - Extend Monitoring Stack instantiation with CD pipeline dependencies (pipeline ARN, deployments table, SNS topics)
  - Configure stack tags (Project, Environment, ManagedBy)
  - Set stack names with environment prefix
  - Call app.synth() at the end
  - **Validates**: TR-1, TR-2

- [ ] 23.2 Update `infrastructure/cdk.json` if needed
  - Verify app entry point configuration
  - Verify context parameters (environment, account, region)
  - Verify feature flags (@aws-cdk/core:enableStackNameDuplicates, stackRelativeExports)
  - Verify exclude patterns (node_modules, cdk.out, dist)
  - **Validates**: TR-1

### 24. Deployment Scripts
- [ ] 24.1 Create `infrastructure/deploy-pipeline.sh`
  - Add shebang (#!/bin/bash) and set -e for error handling
  - Implement environment validation (check ENVIRONMENT variable)
  - Implement CDK bootstrap check (verify account is bootstrapped)
  - Implement sequential stack deployment (Core → Pipeline → Monitoring)
  - Add progress logging for each deployment step
  - Implement post-deployment validation (call validate-deployment.sh)
  - Add error handling with rollback instructions
  - Make script executable (chmod +x)
  - **Validates**: Design Section 8.1, NFR-4

- [ ] 24.2 Create `infrastructure/validate-deployment.sh`
  - Add shebang and error handling
  - Implement pipeline existence check (aws codepipeline get-pipeline)
  - Implement CodeBuild projects check (list and verify all 5 projects exist)
  - Implement S3 bucket check (verify artifacts bucket exists and has encryption)
  - Implement DynamoDB table check (verify deployments table exists with GSI)
  - Implement Lambda function check (verify rollback Lambda exists)
  - Implement SNS topics check (verify all 3 topics exist)
  - Output validation results with pass/fail for each check
  - Exit with error code if any check fails
  - **Validates**: Design Section 8.3

### 25. Secrets and Parameters Setup
- [ ] 25.1 Create `infrastructure/scripts/setup-secrets.sh`
  - Add shebang and error handling
  - Create GitHub token secret placeholder in Secrets Manager
  - Create Slack webhook secret placeholder (optional)
  - Output secret ARNs for configuration
  - Add instructions for populating secrets manually
  - Check if secrets already exist before creating
  - **Validates**: TR-2, NFR-2

- [ ] 25.2 Create `infrastructure/scripts/setup-parameters.sh`
  - Add shebang and error handling
  - Create GitHub owner parameter in Systems Manager Parameter Store
  - Create GitHub repo parameter
  - Create environment-specific parameters (alarm thresholds, timeouts)
  - Output parameter names for reference
  - Check if parameters already exist before creating
  - **Validates**: TR-2

## Phase 12: Documentation

### 26. Deployment Documentation
- [ ] 26.1 Create `docs/deployment/cd-pipeline-deployment.md`
  - Document prerequisites (AWS account, CDK installed, GitHub token, permissions)
  - Document deployment steps (bootstrap, secrets setup, stack deployment)
  - Document configuration requirements (environment variables, context parameters)
  - Document post-deployment validation steps
  - Document troubleshooting steps (common errors, solutions)
  - Include example commands for each step
  - Add diagrams if helpful
  - **Validates**: NFR-4

- [ ] 26.2 Create `docs/deployment/cd-pipeline-rollback.md`
  - Document automated rollback process (triggers, flow, validation)
  - Document manual rollback procedures (when to use, steps)
  - Document rollback validation steps
  - Document rollback troubleshooting (common issues, recovery)
  - Include example commands for manual rollback
  - Document how to verify rollback success
  - **Validates**: NFR-4, US-5

### 27. Operations Documentation
- [ ] 27.1 Create `docs/operations/cd-pipeline-monitoring.md`
  - Document CloudWatch dashboard usage (metrics, widgets, interpretation)
  - Document alarm configuration (thresholds, actions, tuning)
  - Document metric interpretation (what each metric means, normal ranges)
  - Document log analysis (where logs are, how to search, common patterns)
  - Include screenshots of dashboard
  - Document how to create custom queries
  - **Validates**: NFR-3, NFR-4

- [ ] 27.2 Create `docs/operations/cd-pipeline-runbook.md`
  - Document common operational tasks (trigger deployment, approve production, check status)
  - Document incident response procedures (pipeline failure, rollback failure, alarm investigation)
  - Document escalation paths (who to contact, when to escalate)
  - Document manual intervention procedures (stop pipeline, manual rollback, emergency fixes)
  - Include decision trees for common scenarios
  - Document on-call procedures
  - **Validates**: NFR-4

## Phase 13: Final Validation

### 28. End-to-End Testing
- [ ] 28.1 Deploy pipeline to test environment
  - Execute deploy-pipeline.sh script with ENVIRONMENT=test
  - Validate all resources created using validate-deployment.sh
  - Verify IAM permissions using AWS IAM Access Analyzer
  - Verify encryption enabled on all resources (S3, DynamoDB, logs)
  - Check CloudWatch dashboard is accessible
  - Verify SNS topics have subscriptions
  - **Validates**: All requirements

- [ ] 28.2 Execute full pipeline test
  - Create test commit to main branch
  - Trigger pipeline and verify source stage completes
  - Verify build stage completes with tests passing
  - Verify test environment deployment completes
  - Verify integration tests run and pass
  - Verify staging environment deployment completes
  - Verify E2E tests run and pass
  - Approve production deployment manually
  - Verify production deployment completes
  - Check deployment record in DynamoDB
  - **Validates**: US-1, US-2, US-3, US-4

- [ ] 28.3 Test rollback scenarios
  - Trigger rollback via test failure (inject failing test)
  - Verify stage-level rollback executes
  - Trigger rollback via alarm (manually set alarm to ALARM state)
  - Verify rollback Lambda is invoked
  - Test full rollback fallback (simulate stage rollback failure)
  - Verify rollback validation runs
  - Check rollback notifications sent
  - Verify deployment record updated with rollback info
  - **Validates**: US-5, TR-6

- [ ] 28.4 Test notification delivery
  - Verify deployment start notification sent
  - Verify deployment success notification sent
  - Verify deployment failure notification sent (from rollback test)
  - Verify rollback notifications sent
  - Check SNS message format is correct JSON
  - Verify email notifications received
  - **Validates**: US-6

- [ ] 28.5 Verify monitoring and observability
  - Check CloudWatch dashboard shows pipeline metrics
  - Verify deployment duration metric published
  - Verify rollback metric published (from rollback test)
  - Verify test results metric published
  - Verify alarms are configured correctly
  - Verify logs are centralized in CloudWatch
  - Check log retention is set to 90 days
  - **Validates**: TR-5, NFR-3

### 29. Performance Validation
- [ ] 29.1 Measure pipeline execution time
  - Measure total pipeline duration (source to production)
  - Measure build stage duration
  - Measure test environment deployment duration
  - Measure staging environment deployment duration
  - Measure production deployment duration
  - Verify all durations meet targets (total < 60 min)
  - Document actual timings in test results
  - **Validates**: TR-8, NFR-1

- [ ] 29.2 Measure rollback execution time
  - Measure stage-level rollback duration
  - Measure full rollback duration
  - Verify rollback completes in < 15 minutes
  - Document actual timings
  - **Validates**: TR-6, TR-8

### 30. Security Validation
- [ ] 30.1 Validate IAM permissions
  - Review all IAM roles and policies in CloudFormation templates
  - Verify least privilege principle (no wildcard actions/resources)
  - Verify no overly permissive policies
  - Run IAM Access Analyzer on all roles
  - Document any findings and remediate
  - **Validates**: NFR-2

- [ ] 30.2 Validate encryption
  - Verify S3 bucket encryption (check bucket properties)
  - Verify DynamoDB table encryption (check table properties)
  - Verify CloudWatch log encryption (check log group properties)
  - Verify secrets encryption (Secrets Manager default)
  - Verify KMS key rotation enabled
  - **Validates**: NFR-2

- [ ] 30.3 Validate security scanning
  - Verify cfn-guard rules execute in build stage
  - Verify cfn-lint executes in build stage
  - Verify npm audit executes in build stage
  - Inject security violation and verify deployment blocked
  - Verify security scan results in build logs
  - **Validates**: TR-4, US-3, NFR-2

### 31. Coverage and Quality Validation
- [ ] 31.1 Run all tests and verify coverage
  - Execute all unit tests: `npm test` in infrastructure/
  - Execute all integration tests (if not skipped)
  - Execute all property-based tests
  - Verify code coverage ≥ 80% for all metrics (lines, functions, branches, statements)
  - Verify all tests pass (100% success rate)
  - Review coverage report HTML for gaps
  - **Validates**: TR-3, NFR-4

- [ ] 31.2 Run linting and type checking
  - Execute ESLint: `npm run lint` in infrastructure/
  - Execute TypeScript compiler: `npm run build`
  - Fix all errors and warnings
  - Verify no type errors
  - **Validates**: NFR-4

### 32. Documentation Review
- [ ] 32.1 Review all documentation
  - Verify deployment documentation is complete and accurate
  - Verify operations documentation is complete and accurate
  - Verify troubleshooting guides are complete
  - Verify all code has JSDoc comments for public APIs
  - Test documentation by following steps
  - Update documentation based on testing feedback
  - **Validates**: NFR-4

## Success Criteria Checklist

Upon completion of all tasks, verify:

- [ ] ✅ CD Pipeline automatically deploys changes from main branch to all environments (test → staging → production)
- [ ] ✅ All tests (unit, integration, E2E) run and pass before deployment with ≥80% coverage
- [ ] ✅ Security scans (cfn-guard, cfn-lint, npm audit) block deployment when critical issues found
- [ ] ✅ Manual approval gate prevents unauthorized production deployments (24-hour timeout)
- [ ] ✅ Automated rollback triggers on test failures and alarm state changes (via EventBridge)
- [ ] ✅ Deployment notifications sent for all events (start, success, failure, rollback) via SNS
- [ ] ✅ Infrastructure changes detected and deployed only when necessary (using git diff + CDK diff)
- [ ] ✅ Pipeline execution completes in < 60 minutes (measured end-to-end)
- [ ] ✅ Rollback completes in < 15 minutes (both stage-level and full rollback)
- [ ] ✅ All 7 correctness properties pass property-based tests (using fast-check)
- [ ] ✅ Code coverage ≥ 80% for all CD pipeline components (lines, functions, branches, statements)
- [ ] ✅ CloudWatch dashboard shows CD pipeline health metrics (executions, duration, success rate, rollbacks)
- [ ] ✅ Deployment history tracked in DynamoDB with 90-day TTL
- [ ] ✅ All IAM permissions follow least privilege principle (no wildcard actions/resources)
- [ ] ✅ All resources encrypted (S3, DynamoDB, CloudWatch logs) with KMS key rotation enabled
- [ ] ✅ CD pipeline integrates with existing Kiro CodeBuild Worker infrastructure without breaking changes

## Notes

- Tasks marked with `*` are optional enhancements (Slack integration)
- All tasks must achieve ≥80% code coverage (enforced by Vitest)
- All tests must pass before marking task complete (no exceptions)
- Follow TypeScript and AWS CDK coding standards from steering documentation
- Use AWS SDK v3 with modular imports (not v2)
- Implement proper error handling for all components with custom error classes
- Use structured logging throughout (JSON format with timestamp, level, context)
- Apply least privilege IAM permissions (specific actions and resources only)
- Enable encryption for all resources (S3, DynamoDB, logs, secrets)
- Document all public APIs with JSDoc comments
- Write property-based tests for critical correctness properties
- Test both success and failure paths for all components
- Mock AWS SDK clients using aws-sdk-client-mock for unit tests
- Use integration tests for end-to-end validation (mark with test.skip for unit runs)
- Follow conventional commits format for all Git commits
- Create pull requests with detailed descriptions and test results
- Update documentation as implementation progresses
- **IMPORTANT**: This CD pipeline is a NEW feature being added to the existing Kiro CodeBuild Worker project
- Reuse existing infrastructure stacks where appropriate (extend monitoring-alerting-stack, use existing environment config)
- Ensure CD pipeline does not break existing Kiro Worker functionality
- The CD pipeline will deploy the Kiro Worker application itself through the multi-environment flow
