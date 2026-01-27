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
- [x] 1.1 Create `infrastructure/lib/types/` directory and type definition files
  - Create `infrastructure/lib/types/pipeline-types.ts` with DeploymentRecord, Environment, DeploymentStatus, RollbackLevel, HealthCheckResult, AlarmInfo, TestResults, SecurityViolation, FailedTest interfaces
  - Create `infrastructure/lib/types/pipeline-config.ts` with PipelineConfig, PipelineEnvironmentConfig, BuildConfig, MonitoringConfig interfaces
  - Create `infrastructure/lib/types/index.ts` to export all types
  - **Validates**: Design Section 4, TR-2

- [x] 1.2 Write unit tests for type definitions
  - Create `infrastructure/test/types/pipeline-types.test.ts`
  - Test type guards and validation functions if any
  - Test type compatibility and structure
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 2. Environment Configuration Extension
- [x] 2.1 Extend `infrastructure/lib/config/environments.ts` with CD pipeline configuration
  - Add pipeline-specific fields to EnvironmentConfig interface (githubOwner, githubRepo, healthCheckDuration, alarmPrefixes, pipelineEnabled)
  - Update test environment with pipeline settings (healthCheckDuration: 5 minutes, pipelineEnabled: true)
  - Update staging environment with pipeline settings (healthCheckDuration: 5 minutes, pipelineEnabled: true)
  - Update production environment with stricter settings (healthCheckDuration: 10 minutes, pipelineEnabled: true)
  - **Validates**: TR-2

- [x] 2.2 Update environment configuration tests
  - Update `infrastructure/test/config/environments.test.ts` to test new pipeline fields
  - Test that all environments have required pipeline configuration
  - Test validation of pipeline-specific fields
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 3. CD Pipeline Core Infrastructure Stack
- [x] 3.1 Create `infrastructure/lib/stacks/cd-pipeline-core-stack.ts`
  - Create S3 artifacts bucket for pipeline with encryption (KMS), versioning, lifecycle policies (90 day expiration, 30 day IA transition), and public access blocked
  - Create DynamoDB deployments table with partition key (deploymentId), TTL attribute (expiresAt), GSI (EnvironmentStatusIndex with environment as PK and status as SK), point-in-time recovery, and encryption
  - Create KMS encryption key with rotation enabled for pipeline resources
  - Create CloudWatch log groups for pipeline (/aws/codepipeline/kiro-pipeline-{env}) and rollback (/aws/lambda/kiro-pipeline-{env}-rollback) with 90-day retention
  - Export stack outputs (artifactsBucketArn, artifactsBucketName, deploymentsTableName, deploymentsTableArn, kmsKeyArn, pipelineLogGroupName, rollbackLogGroupName)
  - **Validates**: TR-1, TR-5, NFR-2

- [x] 3.2 Write unit tests for CD Pipeline Core Infrastructure Stack
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

### 4. Pipeline CodeBuild Construct
- [x] 4.1 Create `infrastructure/lib/constructs/pipeline-codebuild-construct.ts`
  - Create reusable CodeBuild project construct for CD pipeline stages
  - Accept props (projectName, environment, buildSpecPath, artifactsBucket, environmentVariables, role)
  - Configure build environment (LinuxBuildImage.STANDARD_7_0, ComputeType.SMALL, Node.js 18)
  - Configure caching (SOURCE, DOCKER_LAYER, CUSTOM modes) with paths for node_modules, infrastructure/node_modules, .npm
  - Configure logging to CloudWatch with log group and stream
  - Configure IAM role with required permissions (logs:*, s3:GetObject, s3:PutObject, secretsmanager:GetSecretValue, sts:AssumeRole for CDK deploy)
  - Set timeout (60 minutes) and queued timeout (8 hours)
  - Export project ARN and name
  - **Validates**: TR-1, TR-8, NFR-2

- [x] 4.2 Write unit tests for Pipeline CodeBuild Construct
  - Create `infrastructure/test/constructs/pipeline-codebuild-construct.test.ts`
  - Test build environment configuration (image, compute type, runtime)
  - Test caching configuration (all 3 modes enabled with correct paths)
  - Test IAM permissions are least privilege (specific actions and resources, no wildcards)
  - Test logging configuration (log group, retention)
  - Test timeout settings (build and queued)
  - Verify construct creates project with proper naming
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 5. Pipeline Stack
- [x] 5.1 Create `infrastructure/lib/stacks/cd-pipeline-stack.ts`
  - Import core stack outputs (artifacts bucket, deployments table, KMS key)
  - Create CodePipeline with 5 stages: Source, Build, TestEnv, StagingEnv, ProductionEnv
  - Configure GitHub source action with webhook trigger and OAuth token from Secrets Manager (kiro-pipeline-{env}-github-token)
  - Create source output artifact
  - Create IAM role for pipeline with least privilege permissions (codebuild:BatchGetBuilds, codebuild:StartBuild, s3:GetObject, s3:PutObject on artifacts bucket only)
  - Configure artifact storage in S3 with KMS encryption
  - Add manual approval action before production stage with SNS notification
  - Set pipeline timeout and retry settings
  - Export pipeline ARN and name
  - **Validates**: TR-1, US-1, US-6, NFR-2

- [x] 5.2 Add CodeBuild projects to Pipeline Stack using PipelineCodeBuildConstruct
  - Create build stage CodeBuild project with buildspec-build.yml
  - Create integration test CodeBuild project with buildspec-integration-test.yml
  - Create E2E test CodeBuild project with buildspec-e2e-test.yml
  - Create deployment CodeBuild projects for test, staging, and production with buildspec-deploy.yml
  - Configure environment variables for each project (ENVIRONMENT, COVERAGE_THRESHOLD, AWS_REGION, ACCOUNT_ID, TABLE_NAME)
  - Configure test reports output (JUnit XML format at test-results/*.xml)
  - Configure coverage reports output (Clover XML format at coverage/coverage-final.json)
  - Grant read access to GitHub token secret
  - Add projects as actions to appropriate pipeline stages
  - **Validates**: TR-3, TR-4, US-1, US-2, US-3

- [x] 5.3 Write unit tests for Pipeline Stack
  - Create `infrastructure/test/stacks/cd-pipeline-stack.test.ts`
  - Test pipeline has exactly 5 stages in correct order (Source, Build, TestEnv, StagingEnv, ProductionEnv)
  - Test source action configured with GitHub webhook trigger
  - Test source action uses Secrets Manager for OAuth token
  - Test manual approval action exists in production stage
  - Test manual approval has SNS topic configured
  - Test IAM role has least privilege permissions (no wildcard actions/resources)
  - Test artifacts stored in S3 with KMS encryption
  - Test all 5 CodeBuild projects created with correct buildspecs
  - Verify snapshot matches expected resources
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 6. Buildspec Files for CD Pipeline
- [ ] 6.1 Create `buildspec-build.yml` in project root
  - Configure install phase (Node.js 18, npm ci for dependencies)
  - Configure pre_build phase (npm run lint, npm audit --audit-level=high, npm run test:coverage)
  - Configure build phase (npm run build, cd infrastructure && npm ci && npm run build, cdk synth --all)
  - Configure post_build phase (install cfn-lint and cfn-guard, run cfn-lint on cdk.out/**/*.template.json, run cfn-guard validate with infrastructure/security-rules.guard)
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
  - Configure pre_build phase (detect infrastructure changes using git diff on infrastructure/**, buildspec*.yml, cdk.json)
  - Configure build phase (cdk diff --all for change preview, conditional cdk deploy --all based on changes detected)
  - Configure post_build phase (verify deployment success, update deployment record in DynamoDB using AWS CLI)
  - Configure environment variables (ENVIRONMENT, AWS_REGION, ACCOUNT_ID, TABLE_NAME)
  - Include logic to skip CDK deployment if no infrastructure changes detected
  - **Validates**: TR-1, US-1, US-7

### 7. Security Scanning Configuration
- [ ] 7.1 Create `infrastructure/security-rules.guard` in infrastructure directory
  - Define S3 bucket encryption rule (ServerSideEncryptionConfiguration with AES256 or aws:kms required)
  - Define S3 bucket public access rule (all 4 BlockPublicAccess settings must be true)
  - Define DynamoDB encryption rule (SSESpecification.SSEEnabled must be true)
  - Define Lambda DLQ rule (DeadLetterConfig must exist)
  - Define IAM wildcard permissions rule (Action='*' or Resource='*' with Effect='Allow' not allowed)
  - Add comments explaining each rule and security rationale
  - **Validates**: TR-4, US-3, NFR-2

- [ ] 7.2 Write tests for security rules
  - Create `infrastructure/test/security/security-rules.test.ts`
  - Test that security-rules.guard file exists and is valid
  - Test rules against sample CloudFormation templates (both passing and failing cases)
  - Test that buildspec-build.yml includes cfn-guard execution
  - Achieve ≥80% coverage
  - **Validates**: NFR-4


## Phase 3: Deployment State Management and Infrastructure Change Detection

### 8. Deployment State Manager Component
- [ ] 8.1 Create `infrastructure/lib/components/` directory and deployment state manager
  - Create `infrastructure/lib/components/deployment-state-manager.ts`
  - Import AWS SDK v3 DynamoDB client (DynamoDBClient, PutItemCommand, UpdateItemCommand, QueryCommand)
  - Implement `recordDeploymentStart()` method that creates deployment record with all required fields (deploymentId, environment, version, status, timestamps, etc.)
  - Implement `updateDeploymentStatus()` method that updates status, endTime, and test results
  - Implement `getLastKnownGoodDeployment()` method that queries GSI for most recent succeeded deployment
  - Implement `getDeploymentHistory()` method that queries by environment with pagination support
  - Use proper error handling with try-catch and custom errors
  - Calculate TTL as current timestamp + 90 days in seconds
  - **Validates**: Design Section 3.5, TR-6

- [ ] 8.2 Write unit tests for Deployment State Manager
  - Create `infrastructure/test/components/deployment-state-manager.test.ts`
  - Test recordDeploymentStart creates record with correct structure and TTL
  - Test updateDeploymentStatus updates status and timestamps correctly
  - Test updateDeploymentStatus updates test results when provided
  - Test getLastKnownGoodDeployment returns most recent succeeded deployment
  - Test getLastKnownGoodDeployment returns null when no succeeded deployments exist
  - Test getDeploymentHistory returns deployments in descending order by timestamp
  - Test error handling for DynamoDB failures
  - Mock DynamoDB client using aws-sdk-client-mock
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 9. Infrastructure Change Detector Component
- [ ] 9.1 Create `infrastructure/lib/components/infrastructure-change-detector.ts`
  - Import simple-git for Git operations
  - Implement `detectChanges()` method that checks both file changes and CDK diff
  - Implement `getChangedFiles()` method using git diff between commits
  - Implement `runCdkDiff()` method that executes cdk diff and captures output
  - Implement `hasMeaningfulChanges()` method that parses diff for Resources/Parameters/Outputs sections
  - Filter for infrastructure files (infrastructure/**, buildspec*.yml, cdk.json)
  - Ignore metadata-only changes (tags, descriptions without resource changes)
  - Return boolean indicating if CDK deployment is needed
  - **Validates**: Design Section 3.2, US-7

- [ ] 9.2 Write unit tests for Infrastructure Change Detector
  - Create `infrastructure/test/components/infrastructure-change-detector.test.ts`
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


## Phase 4: Monitoring, Health Checks, and Metrics

### 10. Health Check Monitor Component
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
  - Create `infrastructure/test/components/health-check-monitor.test.ts`
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
  - Create `infrastructure/test/properties/health-check-monotonicity.test.ts`
  - Implement Property 3: Health Check Monotonicity from design
  - Use fast-check to generate random durations and alarm states
  - Verify that once a check fails, it never succeeds in the same monitoring session
  - Test with various alarm state transition sequences
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 3

### 11. Pipeline Metrics Publisher Component
- [ ] 11.1 Create `infrastructure/lib/components/pipeline-metrics.ts`
  - Import AWS SDK v3 CloudWatch client (CloudWatchClient, PutMetricDataCommand)
  - Implement `publishDeploymentDuration()` method with environment dimension
  - Implement `publishRollback()` method with environment and level dimensions
  - Implement `publishTestResults()` method with test type dimension
  - Use custom namespace 'KiroPipeline' for all metrics
  - Include timestamp with each metric data point
  - Use appropriate units (Seconds, Count, Percent)
  - Handle errors gracefully (log but don't fail deployment)
  - **Validates**: Design Section 9.2, TR-5, NFR-3

- [ ] 11.2 Write unit tests for Pipeline Metrics
  - Create `infrastructure/test/components/pipeline-metrics.test.ts`
  - Test publishDeploymentDuration sends correct metric with dimensions
  - Test publishRollback sends metric with environment and level dimensions
  - Test publishTestResults calculates and sends success rate percentage
  - Test metric namespace is 'KiroPipeline'
  - Test correct units used for each metric type
  - Test error handling when CloudWatch API fails
  - Mock CloudWatch client using aws-sdk-client-mock
  - Achieve ≥80% coverage
  - **Validates**: NFR-4

### 12. Extend Monitoring Stack with CD Pipeline Monitoring
- [ ] 12.1 Extend `infrastructure/lib/stacks/monitoring-alerting-stack.ts` with CD pipeline monitoring
  - Import pipeline ARN and deployments table from CD pipeline stacks
  - Create SNS topic for deployment notifications with email subscription
  - Create SNS topic for approval requests with email subscription
  - Create SNS topic for rollback notifications with email subscription
  - Create CloudWatch alarm for pipeline failures (threshold: 3 failures in 1 hour)
  - Create CloudWatch alarm for rollback count (threshold: 2 rollbacks in 1 hour)
  - Create CloudWatch alarm for deployment duration (threshold: > 60 minutes)
  - Add pipeline metrics widgets to existing CloudWatch dashboard (executions, duration, success rate, rollback count)
  - Configure alarm actions to send to appropriate SNS topics
  - Export topic ARNs for use in other stacks
  - **Validates**: TR-5, US-4, US-6, NFR-3

- [ ] 12.2 Write unit tests for CD Pipeline Monitoring additions
  - Update `infrastructure/test/stacks/monitoring-alerting-stack.test.ts`
  - Test all 3 new SNS topics created with correct names
  - Test SNS topics have email subscriptions configured
  - Test CloudWatch alarms created with correct thresholds (3 failures, 2 rollbacks, 60 min duration)
  - Test alarms have SNS actions configured
  - Test dashboard has pipeline metrics widgets
  - Verify snapshot matches expected resources
  - Achieve ≥80% coverage
  - **Validates**: NFR-4


## Phase 5: Automated Rollback System

### 13. Rollback Orchestrator and Validator Components
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

- [ ] 13.2 Create `infrastructure/lib/components/rollback-validator.ts`
  - Import CloudWatch client and HealthCheckMonitor
  - Implement `validateRollback()` method that performs full validation
  - Implement alarm state checking (all alarms must be OK)
  - Implement health check execution (must pass)
  - Implement version verification (deployed version matches target)
  - Configure 1-minute stabilization wait before validation
  - Return ValidationResult with success flag and reason
  - Use structured logging for validation steps
  - **Validates**: Design Section 3.4.3, TR-6

- [ ] 13.3 Write unit tests for Rollback Orchestrator and Validator
  - Create `infrastructure/test/components/rollback-orchestrator.test.ts`
  - Test executeRollback performs stage-level rollback first
  - Test executeRollback falls back to full rollback when stage rollback fails
  - Test rollbackStage reverts infrastructure and application
  - Test rollbackFull reverts all environments in correct order
  - Test validateRollback checks alarms and health
  - Test rollback state recording in DynamoDB
  - Test notification sending at each stage
  - Test error handling and fallback logic
  - Create `infrastructure/test/components/rollback-validator.test.ts`
  - Test validateRollback succeeds when all checks pass
  - Test validateRollback fails when alarms still in ALARM state
  - Test validateRollback fails when health checks fail
  - Test 1-minute stabilization wait occurs
  - Mock CodePipeline, DynamoDB, SNS, CloudWatch clients
  - Achieve ≥80% coverage for both files
  - **Validates**: NFR-4

- [ ] 13.4 Write property-based test for rollback idempotency
  - Create `infrastructure/test/properties/rollback-idempotency.test.ts`
  - Implement Property 2: Rollback Idempotency from design
  - Use fast-check to generate random deployment states
  - Verify executing rollback multiple times produces same result
  - Test with various deployment configurations
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 2

### 14. Rollback Lambda Function and EventBridge Integration
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

- [ ] 14.2 Add rollback Lambda and EventBridge rule to Monitoring Stack
  - Update `infrastructure/lib/stacks/monitoring-alerting-stack.ts`
  - Create Lambda function with rollback-handler code
  - Configure IAM role with permissions (codepipeline:*, dynamodb:*, sns:Publish, logs:*)
  - Configure environment variables (TABLE_NAME, PIPELINE_ARN, TOPIC_ARN)
  - Configure timeout (15 minutes), memory (512 MB), DLQ, retry attempts (0)
  - Grant permissions to read from deployments table
  - Create EventBridge rule for CD pipeline alarms
  - Configure event pattern (source: aws.cloudwatch, detailType: CloudWatch Alarm State Change, alarmName prefix, state.value: ALARM)
  - Add rollback Lambda as target
  - **Validates**: TR-5, TR-6, US-4, US-5, NFR-2

- [ ] 14.3 Write unit tests for Rollback Lambda and EventBridge integration
  - Create `infrastructure/test/lambda/rollback-handler.test.ts`
  - Test handler processes alarm events correctly
  - Test AlarmEventProcessor filters deployment-related alarms
  - Test AlarmEventProcessor ignores non-deployment alarms
  - Test rollback triggering for valid alarm events
  - Test error handling for missing deployment
  - Test error handling for rollback failures
  - Update `infrastructure/test/stacks/monitoring-alerting-stack.test.ts`
  - Test Lambda function created with correct configuration
  - Test EventBridge rule created with correct event pattern
  - Test Lambda has required IAM permissions
  - Mock EventBridge events with various alarm states
  - Mock DynamoDB and CodePipeline clients
  - Achieve ≥80% coverage
  - **Validates**: NFR-4


## Phase 6: Notification System and Error Handling

### 15. Notification Service Component
- [ ] 15.1 Create `infrastructure/lib/components/notification-service.ts`
  - Import AWS SDK v3 SNS client (SNSClient, PublishCommand)
  - Implement `notifyDeploymentStart()`, `notifyDeploymentSuccess()`, `notifyDeploymentFailure()` methods
  - Implement `notifyRollbackInitiated()`, `notifyRollbackSuccess()`, `notifyRollbackFailure()` methods
  - Format all messages as JSON with event type, timestamp, environment, version, execution ID, and relevant data
  - Handle SNS publish errors gracefully (log but don't fail)
  - **Validates**: Design Section 3.6, US-6

- [ ] 15.2 Write unit tests and property-based test for Notification Service
  - Create `infrastructure/test/components/notification-service.test.ts`
  - Test all 6 notification methods send correct message format
  - Test all messages are valid JSON with required fields
  - Test error handling when SNS publish fails
  - Mock SNS client using aws-sdk-client-mock
  - Create `infrastructure/test/properties/notification-delivery.test.ts`
  - Implement Property 7: Notification Delivery from design
  - Use fast-check to generate random deployment events
  - Verify notification sent for every deployment event type
  - Achieve ≥80% coverage
  - **Validates**: Design Section 12, Property 7, NFR-4

### 16. Custom Error Classes and Utilities
- [ ] 16.1 Create custom error classes in `infrastructure/lib/errors/` directory
  - Create `infrastructure/lib/errors/pipeline-error.ts` (PipelineError with stage and cause properties)
  - Create `infrastructure/lib/errors/rollback-error.ts` (RollbackError with deployment and cause properties)
  - Create `infrastructure/lib/errors/health-check-error.ts` (HealthCheckError with failedAlarms and cause properties)
  - Create `infrastructure/lib/errors/security-scan-error.ts` (SecurityScanError with violations and cause properties)
  - Create `infrastructure/lib/errors/index.ts` to export all errors
  - **Validates**: Design Section 6.1

- [ ] 16.2 Create utility functions in `infrastructure/lib/utils/` directory
  - Create `infrastructure/lib/utils/structured-logger.ts` (StructuredLogger class with log(), info(), error(), warn() methods outputting JSON)
  - Create `infrastructure/lib/utils/retry.ts` (retry() function with exponential backoff, defaults: maxAttempts=3, initialDelay=1000ms, maxDelay=10000ms, multiplier=2)
  - Create `infrastructure/lib/utils/index.ts` to export utilities
  - **Validates**: Design Section 9.4, Design Section 6.2, NFR-1, NFR-3

- [ ] 16.3 Write unit tests for errors and utilities
  - Create `infrastructure/test/errors/custom-errors.test.ts`
  - Test all 4 error classes instantiation with properties
  - Test error name, message, and inheritance from Error
  - Create `infrastructure/test/utils/structured-logger.test.ts`
  - Test log() formats output as JSON with timestamp, level, message, context
  - Test info(), error(), warn() methods
  - Test error serialization includes name, message, stack
  - Create `infrastructure/test/utils/retry.test.ts`
  - Test successful retry after failures
  - Test exhausting max attempts and throwing error
  - Test exponential backoff timing (1s, 2s, 4s)
  - Test max delay cap is enforced
  - Mock console.log and operation functions
  - Use vitest fake timers for timing tests
  - Achieve ≥80% coverage for all files
  - **Validates**: NFR-4


## Phase 7: Property-Based Tests and Integration Tests

### 17. Core Property-Based Tests
- [ ] 17.1 Write property test for deployment ordering
  - Create `infrastructure/test/properties/deployment-ordering.test.ts`
  - Implement Property 1: Deployment Ordering from design
  - Use fast-check to generate random environment sequences
  - Verify test always comes before staging, staging before production
  - Test with fc.array and fc.constantFrom for environments
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 1, US-1

- [ ] 17.2 Write property test for test coverage threshold
  - Create `infrastructure/test/properties/coverage-threshold.test.ts`
  - Implement Property 3: Test Coverage Threshold from design
  - Use fast-check to generate random coverage percentages (0-100)
  - Verify deployment blocked when coverage < 80%
  - Verify deployment allowed when coverage >= 80%
  - Test with fc.integer({ min: 0, max: 100 })
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 3, US-2

- [ ] 17.3 Write property test for alarm-triggered rollback
  - Create `infrastructure/test/properties/alarm-rollback.test.ts`
  - Implement Property 4: Alarm-Triggered Rollback from design
  - Use fast-check to generate random alarm states
  - Verify rollback triggered when any alarm in ALARM state
  - Verify no rollback when all alarms OK or INSUFFICIENT_DATA
  - Test with fc.array of alarm objects with state property
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 4, US-4

- [ ] 17.4 Write property test for security scan blocking
  - Create `infrastructure/test/properties/security-blocking.test.ts`
  - Implement Property 5: Security Scan Blocking from design
  - Use fast-check to generate random vulnerability arrays
  - Verify deployment blocked for CRITICAL or HIGH severity
  - Verify deployment allowed for only MEDIUM or LOW severity
  - Test with fc.array of vulnerability objects with severity property
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 5, US-3

- [ ] 17.5 Write property test for deployment state consistency
  - Create `infrastructure/test/properties/state-consistency.test.ts`
  - Implement Property 6: Deployment State Consistency from design
  - Use fast-check to generate random deployment operations
  - Verify DynamoDB state always matches pipeline state
  - Test with fc.array of operation objects (start, update, complete, fail)
  - Ensure property holds for all generated inputs
  - **Validates**: Design Section 12, Property 6, TR-6

### 18. Integration Tests
- [ ] 18.1 Create pipeline integration test
  - Create `infrastructure/test/integration/pipeline-integration.test.ts`
  - Test full pipeline execution from source to production (mark with test.skip() for unit test runs)
  - Test pipeline with infrastructure changes (triggers CDK deploy)
  - Test pipeline with application-only changes (skips CDK deploy)
  - Test test failure triggers rollback
  - Test alarm triggers rollback via EventBridge
  - Test manual approval timeout behavior
  - Create helper functions (triggerPipeline, waitForStageCompletion, getTestResults, approveProductionDeployment, getDeploymentRecord, cleanupTestResources)
  - Use real AWS SDK clients with test environment
  - Clean up resources after each test
  - **Validates**: Design Section 7.2, NFR-1

## Phase 8: Deployment Configuration and Scripts

### 19. CDK App Entry Point and Configuration
- [ ] 19.1 Update CDK app entry point for CD pipeline stacks
  - Update `infrastructure/bin/kiro-worker.ts` (or create cd-pipeline.ts if separate)
  - Initialize CDK app and load environment from context
  - Instantiate CD Pipeline Core Infrastructure Stack
  - Instantiate CD Pipeline Stack with dependencies (artifacts bucket, deployments table, KMS key)
  - Update Monitoring Stack instantiation to include CD pipeline dependencies (pipeline ARN, deployments table, SNS topics)
  - Configure stack tags (Project: KiroWorker, Environment, ManagedBy: CDK, Feature: CDPipeline)
  - Set stack names with environment prefix (kiro-pipeline-{env}-core, kiro-pipeline-{env}, etc.)
  - Call app.synth()
  - **Validates**: TR-1, TR-2

- [ ] 19.2 Verify and update cdk.json if needed
  - Verify app entry point configuration points to correct file
  - Verify context parameters (environment, account, region)
  - Verify feature flags (@aws-cdk/core:enableStackNameDuplicates: false, stackRelativeExports: true)
  - Verify exclude patterns (node_modules, cdk.out, dist, test)
  - **Validates**: TR-1

### 20. Deployment and Validation Scripts
- [ ] 20.1 Create deployment script `infrastructure/deploy-pipeline.sh`
  - Add shebang (#!/bin/bash) and set -e for error handling
  - Implement environment validation (check ENVIRONMENT variable is test, staging, or production)
  - Implement CDK bootstrap check (verify account is bootstrapped)
  - Implement sequential stack deployment (Core → Pipeline → Monitoring)
  - Add progress logging for each deployment step
  - Implement post-deployment validation (call validate-deployment.sh)
  - Add error handling with rollback instructions
  - Make script executable (chmod +x)
  - **Validates**: Design Section 8.1, NFR-4

- [ ] 20.2 Create validation script `infrastructure/validate-deployment.sh`
  - Add shebang and error handling
  - Implement pipeline existence check (aws codepipeline get-pipeline)
  - Implement CodeBuild projects check (list and verify all 5 projects exist)
  - Implement S3 bucket check (verify artifacts bucket exists with encryption)
  - Implement DynamoDB table check (verify deployments table exists with GSI and TTL)
  - Implement Lambda function check (verify rollback Lambda exists)
  - Implement SNS topics check (verify all 3 topics exist)
  - Output validation results with pass/fail for each check
  - Exit with error code if any check fails
  - **Validates**: Design Section 8.3

- [ ] 20.3 Create secrets setup script `infrastructure/scripts/setup-secrets.sh`
  - Add shebang and error handling
  - Create GitHub token secret placeholder in Secrets Manager (kiro-pipeline-{env}-github-token)
  - Create Slack webhook secret placeholder (optional, kiro-pipeline-{env}-slack-webhook)
  - Output secret ARNs for configuration
  - Add instructions for populating secrets manually
  - Check if secrets already exist before creating
  - **Validates**: TR-2, NFR-2

- [ ] 20.4 Create parameters setup script `infrastructure/scripts/setup-parameters.sh`
  - Add shebang and error handling
  - Create GitHub owner parameter in Systems Manager Parameter Store (/kiro-pipeline/{env}/github-owner)
  - Create GitHub repo parameter (/kiro-pipeline/{env}/github-repo)
  - Create environment-specific parameters (alarm thresholds, timeouts)
  - Output parameter names for reference
  - Check if parameters already exist before creating
  - **Validates**: TR-2

## Phase 9: Documentation and Final Validation

### 21. Documentation
- [ ] 21.1 Create deployment documentation `docs/deployment/cd-pipeline-deployment.md`
  - Document prerequisites (AWS account, CDK installed, GitHub token, permissions)
  - Document deployment steps (bootstrap, secrets setup, stack deployment)
  - Document configuration requirements (environment variables, context parameters)
  - Document post-deployment validation steps
  - Document troubleshooting steps (common errors, solutions)
  - Include example commands for each step
  - **Validates**: NFR-4

- [ ] 21.2 Create rollback documentation `docs/deployment/cd-pipeline-rollback.md`
  - Document automated rollback process (triggers, flow, validation)
  - Document manual rollback procedures (when to use, steps)
  - Document rollback validation steps
  - Document rollback troubleshooting (common issues, recovery)
  - Include example commands for manual rollback
  - **Validates**: NFR-4, US-5

- [ ] 21.3 Create operations documentation `docs/operations/cd-pipeline-monitoring.md` and `docs/operations/cd-pipeline-runbook.md`
  - Document CloudWatch dashboard usage (metrics, widgets, interpretation)
  - Document alarm configuration (thresholds, actions, tuning)
  - Document common operational tasks (trigger deployment, approve production, check status)
  - Document incident response procedures (pipeline failure, rollback failure, alarm investigation)
  - Document escalation paths and on-call procedures
  - **Validates**: NFR-3, NFR-4

### 22. End-to-End Validation
- [ ] 22.1 Deploy pipeline to test environment and validate
  - Execute deploy-pipeline.sh script with ENVIRONMENT=test
  - Validate all resources created using validate-deployment.sh
  - Verify IAM permissions using AWS IAM Access Analyzer
  - Verify encryption enabled on all resources (S3, DynamoDB, logs)
  - Check CloudWatch dashboard is accessible
  - Verify SNS topics have subscriptions
  - **Validates**: All requirements

- [ ] 22.2 Execute full pipeline test
  - Create test commit to main branch
  - Trigger pipeline and verify all 5 stages complete successfully
  - Verify build stage runs tests with ≥80% coverage
  - Verify test environment deployment completes
  - Verify integration tests run and pass
  - Verify staging environment deployment completes
  - Verify E2E tests run and pass
  - Approve production deployment manually
  - Verify production deployment completes
  - Check deployment record in DynamoDB
  - **Validates**: US-1, US-2, US-3, US-4

- [ ] 22.3 Test rollback scenarios
  - Trigger rollback via test failure (inject failing test)
  - Verify stage-level rollback executes
  - Trigger rollback via alarm (manually set alarm to ALARM state)
  - Verify rollback Lambda is invoked
  - Test full rollback fallback (simulate stage rollback failure)
  - Verify rollback validation runs
  - Check rollback notifications sent
  - Verify deployment record updated with rollback info
  - **Validates**: US-5, TR-6

- [ ] 22.4 Verify monitoring and observability
  - Check CloudWatch dashboard shows pipeline metrics
  - Verify deployment duration metric published
  - Verify rollback metric published (from rollback test)
  - Verify test results metric published
  - Verify alarms are configured correctly
  - Verify logs are centralized in CloudWatch with 90-day retention
  - **Validates**: TR-5, NFR-3

- [ ] 22.5 Validate security and performance
  - Review all IAM roles and policies (verify least privilege, no wildcards)
  - Run IAM Access Analyzer on all roles
  - Verify S3 bucket, DynamoDB table, CloudWatch log encryption
  - Verify KMS key rotation enabled
  - Verify security-rules.guard executes in build stage
  - Measure total pipeline duration (verify < 60 minutes)
  - Measure rollback duration (verify < 15 minutes)
  - **Validates**: TR-8, NFR-1, NFR-2

- [ ] 22.6 Final coverage and quality validation
  - Execute all unit tests: `npm test` in infrastructure/
  - Execute all property-based tests
  - Verify code coverage ≥ 80% for all metrics (lines, functions, branches, statements)
  - Verify all tests pass (100% success rate)
  - Run linting: `npm run lint` in infrastructure/
  - Run TypeScript compiler: `npm run build`
  - Fix all errors and warnings
  - Review coverage report HTML for gaps
  - **Validates**: TR-3, NFR-4

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
