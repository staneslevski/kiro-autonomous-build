# Implementation Tasks: Kiro CodeBuild Worker

## Phase 1: Project Foundation and Core Infrastructure

### 1. Project Setup and Structure
- [ ] 1.1 Initialize TypeScript project with tsconfig.json and package.json
  - **Requirements**: Foundation for Requirements 3, 6, 11
  - **Details**: Set up Node.js/TypeScript project with necessary dependencies (AWS SDK, git libraries, testing frameworks)
  
- [ ] 1.2 Create project directory structure
  - **Requirements**: Foundation for all requirements
  - **Details**: Create src/, tests/, docs/, infrastructure/ directories following the design architecture
  
- [ ] 1.3 Set up testing framework and coverage tools
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Configure Jest or Vitest with Istanbul/NYC for coverage reporting, set 80% threshold

- [ ] 1.4 Create buildspec.yml template
  - **Requirements**: Requirement 6 (CodeBuild Integration), Requirement 11 (Configuration Management)
  - **Details**: Create buildspec.yml with phases for install, pre_build, build, post_build as per design

### 2. Git Branch Manager Component
- [ ] 2.1 Implement GitBranchManager interface and core class
  - **Requirements**: Requirement 1 (Git Branch Management)
  - **Details**: Create GitBranchManager with checkoutMain(), createFeatureBranch(), commitChanges(), pushBranch() methods
  
- [ ] 2.2 Implement branch naming with unique identifiers
  - **Requirements**: Requirement 1.2, Requirement 8 (Work Isolation)
  - **Details**: Generate branch names with pattern `kiro-worker-{environment}-{timestamp}-{uuid}`
  
- [ ] 2.3 Implement retry logic with exponential backoff
  - **Requirements**: Requirement 10 (Error Handling and Recovery)
  - **Details**: Add retry mechanism (3 attempts, 1s/2s/4s delays) for Git operations
  
- [ ] 2.4 Implement credential retrieval from AWS Secrets Manager
  - **Requirements**: Requirement 7 (Credential and Secret Management)
  - **Details**: Retrieve Git credentials from Secrets Manager using IAM role authentication
  
- [ ] 2.5 Write unit tests for GitBranchManager
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test branch creation, commit, push, retry logic, error handling

### 3. Configuration Management System
- [ ] 3.1 Implement configuration loader for buildspec.yml
  - **Requirements**: Requirement 11 (Configuration Management)
  - **Details**: Parse buildspec.yml and extract environment variables, test commands, coverage thresholds
  
- [ ] 3.2 Implement environment-specific configuration
  - **Requirements**: Requirement 5 (Multi-Environment Support)
  - **Details**: Load test/staging/production configurations with environment-specific credentials and settings
  
- [ ] 3.3 Implement configuration validation
  - **Requirements**: Requirement 11.5 (Configuration Management)
  - **Details**: Validate required configuration fields and fail with clear error messages
  
- [ ] 3.4 Write unit tests for configuration management
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test configuration loading, validation, environment-specific behavior

## Phase 2: Kiro Power and Steering Synchronization

### 4. Kiro Power Structure
- [ ] 4.1 Create Kiro Power directory structure
  - **Requirements**: Requirement 13 (Kiro Power for Centralized Steering)
  - **Details**: Create kiro-codebuild-worker-power/ with POWER.md, manifest.json, and steering/ directory
  
- [ ] 4.2 Create steering documentation files
  - **Requirements**: Requirement 13.2 (Kiro Power for Centralized Steering)
  - **Details**: Write git-workflow.md, testing-standards.md, code-review.md, deployment-practices.md
  
- [ ] 4.3 Create manifest.json with version and checksums
  - **Requirements**: Requirement 13.3 (Kiro Power for Centralized Steering)
  - **Details**: Define manifest format with version, steering file paths, and SHA-256 checksums
  
- [ ] 4.4 Write POWER.md documentation
  - **Requirements**: Requirement 13.4 (Kiro Power for Centralized Steering)
  - **Details**: Document the Kiro Power purpose, installation, and usage

### 5. Steering Synchronizer Component
- [ ] 5.1 Implement SteeringSynchronizer interface and core class
  - **Requirements**: Requirement 14 (Steering Synchronization)
  - **Details**: Create SteeringSynchronizer with checkSteeringVersion(), synchronizeSteeringFiles(), commitSteeringUpdates()
  
- [ ] 5.2 Implement version comparison logic
  - **Requirements**: Requirement 14.2 (Steering Synchronization)
  - **Details**: Compare local manifest with Kiro Power manifest, identify missing/outdated files
  
- [ ] 5.3 Implement file download and synchronization
  - **Requirements**: Requirement 14.3 (Steering Synchronization)
  - **Details**: Download missing/outdated steering files from Kiro Power to .kiro/steering/
  
- [ ] 5.4 Implement steering update commit logic
  - **Requirements**: Requirement 14.4 (Steering Synchronization)
  - **Details**: Commit synchronized steering files to feature branch with descriptive message
  
- [ ] 5.5 Write unit tests for SteeringSynchronizer
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test version comparison, file synchronization, commit logic

## Phase 3: Kiro CLI Execution and Test Runner

### 6. Kiro CLI Executor Component
- [ ] 6.1 Implement KiroCLIExecutor interface and core class
  - **Requirements**: Requirement 3 (Kiro CLI Execution), Requirement 12 (Spec Task Execution)
  - **Details**: Create KiroCLIExecutor with executeTask(), captureOutput(), trackFileChanges()
  
- [ ] 6.2 Implement Kiro CLI command execution
  - **Requirements**: Requirement 3.1, 3.2 (Kiro CLI Execution)
  - **Details**: Execute `kiro execute-task --spec {specPath} --task {taskId}` with proper error handling
  
- [ ] 6.3 Implement output capture and logging
  - **Requirements**: Requirement 3.3, Requirement 9 (Build Artifacts and Logging)
  - **Details**: Capture stdout/stderr streams and log to CloudWatch
  
- [ ] 6.4 Implement file change tracking
  - **Requirements**: Requirement 3.5 (Kiro CLI Execution)
  - **Details**: Use git diff to track modified files after Kiro CLI execution
  
- [ ] 6.5 Implement timeout handling
  - **Requirements**: Requirement 6.5 (CodeBuild Integration)
  - **Details**: Respect CodeBuild timeout limits and handle gracefully
  
- [ ] 6.6 Write unit tests for KiroCLIExecutor
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test command execution, output capture, file tracking, timeout handling

### 7. Test Runner and Coverage Analyzer Component
- [ ] 7.1 Implement TestRunner interface and core class
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Create TestRunner with runTests(), analyzeCoverage(), generateTestSummary()
  
- [ ] 7.2 Implement test execution logic
  - **Requirements**: Requirement 4.1, 4.2 (Test Execution)
  - **Details**: Execute test commands (default: npm test) and capture results
  
- [ ] 7.3 Implement coverage analysis
  - **Requirements**: Requirement 4.3, 4.4 (Test Execution)
  - **Details**: Parse Istanbul/NYC coverage reports and calculate percentage
  
- [ ] 7.4 Implement coverage threshold validation
  - **Requirements**: Requirement 4.4 (Test Execution)
  - **Details**: Fail build if coverage < 80%, include coverage in output
  
- [ ] 7.5 Implement test summary generation
  - **Requirements**: Requirement 4.7 (Test Execution)
  - **Details**: Generate human-readable test summary with pass/fail counts
  
- [ ] 7.6 Write unit tests for TestRunner
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test execution, coverage parsing, threshold validation, summary generation

## Phase 4: Pull Request Creation

### 8. Pull Request Creator Component
- [ ] 8.1 Implement PullRequestCreator interface and core class
  - **Requirements**: Requirement 2 (Pull Request Creation)
  - **Details**: Create PullRequestCreator with createPR(), generatePRBody()
  
- [ ] 8.2 Implement GitHub API integration
  - **Requirements**: Requirement 2.1 (Pull Request Creation)
  - **Details**: Use GitHub API to create pull requests with proper authentication
  
- [ ] 8.3 Implement GitLab API integration
  - **Requirements**: Requirement 2.1 (Pull Request Creation)
  - **Details**: Use GitLab API to create merge requests with proper authentication
  
- [ ] 8.4 Implement PR body generation
  - **Requirements**: Requirement 2.2, 2.3, 2.4 (Pull Request Creation)
  - **Details**: Generate PR body with task description, test summary, coverage, build metadata
  
- [ ] 8.5 Implement API token retrieval from Secrets Manager
  - **Requirements**: Requirement 7.2 (Credential and Secret Management)
  - **Details**: Retrieve GitHub/GitLab API tokens from Secrets Manager
  
- [ ] 8.6 Implement retry logic for PR creation
  - **Requirements**: Requirement 10.2 (Error Handling and Recovery)
  - **Details**: Retry PR creation up to 3 times on API failures
  
- [ ] 8.7 Write unit tests for PullRequestCreator
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test PR creation, body generation, API integration, retry logic

## Phase 5: Main Worker Orchestration

### 9. Main Worker Pipeline
- [ ] 9.1 Implement main worker orchestration class
  - **Requirements**: All requirements (orchestration)
  - **Details**: Create KiroWorker class that orchestrates all components in sequence
  
- [ ] 9.2 Implement pipeline execution flow
  - **Requirements**: All requirements (orchestration)
  - **Details**: Execute: checkout → sync steering → execute Kiro CLI → run tests → create PR
  
- [ ] 9.3 Implement error handling and cleanup
  - **Requirements**: Requirement 10 (Error Handling and Recovery)
  - **Details**: Handle failures at each stage, clean up resources, log errors
  
- [ ] 9.4 Implement build status reporting
  - **Requirements**: Requirement 6.3 (CodeBuild Integration)
  - **Details**: Report success/failure status to CodeBuild
  
- [ ] 9.5 Write integration tests for main pipeline
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test end-to-end pipeline execution with mocked components

### 10. Logging and Artifact Management
- [ ] 10.1 Implement CloudWatch Logs integration
  - **Requirements**: Requirement 9.1, 9.2, 9.3 (Build Artifacts and Logging)
  - **Details**: Log all operations to CloudWatch with appropriate log levels
  
- [ ] 10.2 Implement S3 artifact upload
  - **Requirements**: Requirement 9.4 (Build Artifacts and Logging)
  - **Details**: Upload logs, test results, coverage reports, diffs to S3
  
- [ ] 10.3 Implement artifact structure organization
  - **Requirements**: Requirement 9.4 (Build Artifacts and Logging)
  - **Details**: Organize artifacts in S3 with structure: {environment}/{build-id}/logs|reports|diffs
  
- [ ] 10.4 Implement secret sanitization in logs
  - **Requirements**: Requirement 7.4 (Credential and Secret Management)
  - **Details**: Redact credentials from logs, replace with [REDACTED]
  
- [ ] 10.5 Write unit tests for logging and artifacts
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test CloudWatch logging, S3 uploads, secret sanitization

## Phase 6: AWS Infrastructure (CloudFormation/CDK)

### 11. Core Infrastructure Stack
- [ ] 11.1 Create CloudFormation/CDK stack for S3 buckets
  - **Requirements**: Requirement 9.4 (Build Artifacts and Logging)
  - **Details**: Create S3 buckets for artifacts with encryption and versioning
  
- [ ] 11.2 Create CloudFormation/CDK stack for CloudWatch Log Groups
  - **Requirements**: Requirement 6.4 (CodeBuild Integration)
  - **Details**: Create log groups for CodeBuild projects with retention policies
  
- [ ] 11.3 Create CloudFormation/CDK stack for IAM roles
  - **Requirements**: Requirement 7.3 (Credential and Secret Management)
  - **Details**: Create IAM roles for CodeBuild with least-privilege permissions
  
- [ ] 11.4 Write infrastructure tests
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test CloudFormation/CDK template validity and resource creation

### 12. Secrets and Configuration Stack
- [ ] 12.1 Create CloudFormation/CDK stack for Secrets Manager
  - **Requirements**: Requirement 7.1, 7.2 (Credential and Secret Management)
  - **Details**: Create secrets for Git credentials and API tokens
  
- [ ] 12.2 Create CloudFormation/CDK stack for Parameter Store
  - **Requirements**: Requirement 5 (Multi-Environment Support)
  - **Details**: Create parameters for environment-specific configuration
  
- [ ] 12.3 Create CloudFormation/CDK stack for KMS keys
  - **Requirements**: Requirement 7 (Credential and Secret Management)
  - **Details**: Create KMS keys for encrypting secrets
  
- [ ] 12.4 Write infrastructure tests
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test secret creation and encryption configuration

### 13. CodeBuild Projects Stack
- [ ] 13.1 Create CloudFormation/CDK stack for test environment CodeBuild project
  - **Requirements**: Requirement 5.2, Requirement 6 (CodeBuild Integration)
  - **Details**: Create CodeBuild project with test environment configuration
  
- [ ] 13.2 Create CloudFormation/CDK stack for staging environment CodeBuild project
  - **Requirements**: Requirement 5.3, Requirement 6 (CodeBuild Integration)
  - **Details**: Create CodeBuild project with staging environment configuration
  
- [ ] 13.3 Create CloudFormation/CDK stack for production environment CodeBuild project
  - **Requirements**: Requirement 5.4, Requirement 6 (CodeBuild Integration)
  - **Details**: Create CodeBuild project with production environment configuration
  
- [ ] 13.4 Configure VPC settings for CodeBuild projects (if needed)
  - **Requirements**: Requirement 6 (CodeBuild Integration)
  - **Details**: Configure VPC, subnets, security groups for CodeBuild
  
- [ ] 13.5 Write infrastructure tests
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test CodeBuild project creation and configuration

### 14. Monitoring and Alerting Stack
- [ ] 14.1 Implement NotificationInterface abstraction
  - **Requirements**: Requirement 15.5, 15.6 (Infrastructure Monitoring and Alerting)
  - **Details**: Create clean interface for notification delivery (SNS initially, SES future)
  
- [ ] 14.2 Create CloudFormation/CDK stack for SNS topics
  - **Requirements**: Requirement 15.4 (Infrastructure Monitoring and Alerting)
  - **Details**: Create SNS topics for test, staging, production environments
  
- [ ] 14.3 Create CloudFormation/CDK stack for CloudWatch Alarms - Build Metrics
  - **Requirements**: Requirement 15.1, 15.2, 15.3 (Infrastructure Monitoring and Alerting)
  - **Details**: Create alarms for build failure rate, build duration with warning/error thresholds
  
- [ ] 14.4 Create CloudFormation/CDK stack for CloudWatch Alarms - Operation Metrics
  - **Requirements**: Requirement 15.1, 15.2, 15.3 (Infrastructure Monitoring and Alerting)
  - **Details**: Create alarms for Git failures, test failures, PR creation failures
  
- [ ] 14.5 Create CloudFormation/CDK stack for CloudWatch Alarms - Resource Metrics
  - **Requirements**: Requirement 15.1, 15.2, 15.3 (Infrastructure Monitoring and Alerting)
  - **Details**: Create alarms for CPU, memory, network, disk utilization
  
- [ ] 14.6 Configure alarm actions to publish to SNS topics
  - **Requirements**: Requirement 15.4 (Infrastructure Monitoring and Alerting)
  - **Details**: Configure alarms to publish notifications with contextual information
  
- [ ] 14.7 Implement environment-specific alarm thresholds
  - **Requirements**: Requirement 15.7 (Infrastructure Monitoring and Alerting)
  - **Details**: Configure different thresholds for test, staging, production environments
  
- [ ] 14.8 Write infrastructure tests for monitoring
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test alarm creation, SNS topic configuration, notification delivery

## Phase 7: Deployment Tooling and Documentation

### 15. Deployment Documentation
- [ ] 15.1 Create comprehensive README.md
  - **Requirements**: Requirement 16.1, 16.8 (Deployment Strategy and Documentation)
  - **Details**: Write quick start guide, prerequisites overview, link to detailed deployment guide
  
- [ ] 15.2 Create docs/deployment/DEPLOYMENT.md
  - **Requirements**: Requirement 16.1, 16.8 (Deployment Strategy and Documentation)
  - **Details**: Write detailed step-by-step deployment instructions with verification procedures
  
- [ ] 15.3 Create docs/deployment/prerequisites.md
  - **Requirements**: Requirement 16.1, 16.8 (Deployment Strategy and Documentation)
  - **Details**: Document AWS CLI setup, required tools, account requirements
  
- [ ] 15.4 Create docs/deployment/iam-permissions.md
  - **Requirements**: Requirement 16.4, 16.5, 16.6 (Deployment Strategy and Documentation)
  - **Details**: Document complete IAM permissions with sample policies for deployment and runtime
  
- [ ] 15.5 Create docs/deployment/troubleshooting.md
  - **Requirements**: Requirement 16.8 (Deployment Strategy and Documentation)
  - **Details**: Document common errors, permission issues, CloudFormation failures

### 16. Permission Validation Tool
- [ ] 16.1 Implement PermissionValidator interface and core class
  - **Requirements**: Requirement 16.7 (Deployment Strategy and Documentation)
  - **Details**: Create PermissionValidator with validateDeploymentPermissions(), checkRequiredPermissions()
  
- [ ] 16.2 Implement IAM SimulatePrincipalPolicy integration
  - **Requirements**: Requirement 16.7, 16.9 (Deployment Strategy and Documentation)
  - **Details**: Use AWS IAM API to validate permissions before deployment
  
- [ ] 16.3 Implement missing permissions report generation
  - **Requirements**: Requirement 16.9 (Deployment Strategy and Documentation)
  - **Details**: Generate actionable error messages with IAM policy snippets for missing permissions
  
- [ ] 16.4 Write unit tests for PermissionValidator
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test permission validation, error reporting, IAM policy generation

### 17. Deployment Scripts
- [ ] 17.1 Create main deployment orchestration script (deploy.sh)
  - **Requirements**: Requirement 16.2, 16.10 (Deployment Strategy and Documentation)
  - **Details**: Create script to deploy individual or all stacks with dependency handling
  
- [ ] 17.2 Implement prerequisite validation in deployment script
  - **Requirements**: Requirement 16.7 (Deployment Strategy and Documentation)
  - **Details**: Validate AWS credentials, IAM permissions, required tools before deployment
  
- [ ] 17.3 Implement stack deployment logic with dependency handling
  - **Requirements**: Requirement 16.2, 16.3 (Deployment Strategy and Documentation)
  - **Details**: Deploy stacks in correct order: Core → Secrets → CodeBuild → Monitoring → Power
  
- [ ] 17.4 Implement progress reporting and error handling
  - **Requirements**: Requirement 16.10 (Deployment Strategy and Documentation)
  - **Details**: Provide progress feedback, error reporting, deployment summary
  
- [ ] 17.5 Implement dry-run mode for validation
  - **Requirements**: Requirement 16.10 (Deployment Strategy and Documentation)
  - **Details**: Support --dry-run flag to validate without deploying
  
- [ ] 17.6 Implement rollback functionality
  - **Requirements**: Requirement 16.10 (Deployment Strategy and Documentation)
  - **Details**: Support rollback of individual or all stacks in reverse order
  
- [ ] 17.7 Write integration tests for deployment scripts
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test deployment script execution, validation, error handling

### 18. Post-Deployment Validation
- [ ] 18.1 Implement post-deployment validation checks
  - **Requirements**: Requirement 16.8 (Deployment Strategy and Documentation)
  - **Details**: Verify stacks deployed, S3 buckets created, IAM roles configured
  
- [ ] 18.2 Implement secret retrieval validation
  - **Requirements**: Requirement 7 (Credential and Secret Management)
  - **Details**: Test secret retrieval from Secrets Manager after deployment
  
- [ ] 18.3 Implement test CodeBuild execution
  - **Requirements**: Requirement 6 (CodeBuild Integration)
  - **Details**: Trigger test build to verify end-to-end functionality
  
- [ ] 18.4 Implement deployment report generation
  - **Requirements**: Requirement 16.10 (Deployment Strategy and Documentation)
  - **Details**: Generate report with deployed resources, ARNs, verification results
  
- [ ] 18.5 Write tests for post-deployment validation
  - **Requirements**: Requirement 4 (Test Execution)
  - **Details**: Test validation checks, report generation

## Phase 8: Property-Based Testing and Final Validation

### 19. Property-Based Tests
- [ ] 19.1 Write property test: Branch names are always unique
  - **Requirements**: Requirement 8 (Work Isolation)
  - **Details**: Generate multiple branch names and verify uniqueness
  - **Validates**: Requirements 1.2, 8.1, 8.2
  
- [ ] 19.2 Write property test: Retry logic eventually succeeds or exhausts attempts
  - **Requirements**: Requirement 10.2 (Error Handling and Recovery)
  - **Details**: Test retry mechanism with various failure scenarios
  - **Validates**: Requirements 10.2
  
- [ ] 19.3 Write property test: Coverage calculation is always between 0-100%
  - **Requirements**: Requirement 4.3 (Test Execution)
  - **Details**: Test coverage parsing with various report formats
  - **Validates**: Requirements 4.3, 4.4
  
- [ ] 19.4 Write property test: PR body always includes required sections
  - **Requirements**: Requirement 2.3 (Pull Request Creation)
  - **Details**: Generate PR bodies and verify all required sections present
  - **Validates**: Requirements 2.2, 2.3, 2.4

### 20. End-to-End Integration Tests
- [ ] 20.1 Write E2E test: Complete worker execution with successful outcome
  - **Requirements**: All requirements (integration)
  - **Details**: Test full pipeline from checkout to PR creation with mocked Kiro CLI
  
- [ ] 20.2 Write E2E test: Worker execution with test failures
  - **Requirements**: Requirement 4.6, Requirement 10 (Error Handling)
  - **Details**: Test pipeline behavior when tests fail
  
- [ ] 20.3 Write E2E test: Worker execution with coverage below threshold
  - **Requirements**: Requirement 4.4 (Test Execution)
  - **Details**: Test pipeline behavior when coverage < 80%
  
- [ ] 20.4 Write E2E test: Worker execution with Git operation failures
  - **Requirements**: Requirement 10.2 (Error Handling and Recovery)
  - **Details**: Test retry logic and failure handling for Git operations
  
- [ ] 20.5 Write E2E test: Multi-environment execution
  - **Requirements**: Requirement 5 (Multi-Environment Support)
  - **Details**: Test worker execution in test, staging, production environments

### 21. Final Documentation and Polish
- [ ] 21.1 Update README.md with complete usage instructions
  - **Requirements**: Requirement 16.1 (Deployment Strategy and Documentation)
  - **Details**: Add usage examples, configuration guide, troubleshooting tips
  
- [ ] 21.2 Create architecture diagrams
  - **Requirements**: Documentation
  - **Details**: Create visual diagrams for system architecture, deployment flow, pipeline execution
  
- [ ] 21.3 Create API documentation
  - **Requirements**: Documentation
  - **Details**: Generate API docs for all public interfaces and classes
  
- [ ] 21.4 Verify all tests pass and coverage meets 80% threshold
  - **Requirements**: Requirement 4.4 (Test Execution)
  - **Details**: Run full test suite and verify coverage
  
- [ ] 21.5 Perform security audit
  - **Requirements**: Requirement 7 (Credential and Secret Management)
  - **Details**: Audit code for credential leaks, insecure practices, verify secret sanitization

## Summary

**Total Tasks**: 21 major tasks with 105 subtasks
**Estimated Effort**: 8-12 weeks for full implementation
**Priority Order**: Follow phase order (1 → 8) for incremental delivery

**Key Milestones**:
- Phase 1-2: Foundation and steering (2 weeks)
- Phase 3-4: Core execution and PR creation (3 weeks)
- Phase 5: Pipeline orchestration (1 week)
- Phase 6: AWS infrastructure (2 weeks)
- Phase 7: Deployment tooling (2 weeks)
- Phase 8: Testing and validation (2 weeks)
