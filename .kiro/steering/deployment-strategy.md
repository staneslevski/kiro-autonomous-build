# Deployment Strategy Standards

## Overview

This document defines the deployment strategy for the Kiro CodeBuild Worker project. All code written MUST align with this deployment strategy to ensure seamless integration with the CI/CD pipeline and infrastructure.

## Deployment Model

### Multi-Environment Architecture

The system supports three distinct environments:

1. **Test Environment** (`test`)
   - Purpose: Development and testing
   - Polling interval: Every 5 minutes
   - Coverage threshold: 80%
   - Deployment frequency: On-demand
   - Rollback strategy: Immediate

2. **Staging Environment** (`staging`)
   - Purpose: Pre-production validation
   - Polling interval: Every 10 minutes
   - Coverage threshold: 80%
   - Deployment frequency: Weekly or on-demand
   - Rollback strategy: Planned

3. **Production Environment** (`production`)
   - Purpose: Live system
   - Polling interval: Every 15 minutes
   - Coverage threshold: 80%
   - Deployment frequency: Bi-weekly or on-demand
   - Rollback strategy: Immediate with incident response

### Environment Isolation

**CRITICAL RULE**: Each environment is completely isolated with separate:
- AWS accounts or isolated resources
- S3 buckets for artifacts
- DynamoDB tables for locking
- Secrets Manager secrets
- CloudWatch log groups
- SNS topics for alerts
- CodeBuild projects
- Lambda functions

**Code Requirement**: When writing code that references AWS resources, ALWAYS use environment-specific naming:

```typescript
// Good - environment-aware
const bucketName = `kiro-worker-${environment}-artifacts`;
const tableName = `kiro-worker-${environment}-locks`;
const secretName = `kiro-worker-${environment}-github-token`;

// Bad - hardcoded environment
const bucketName = 'kiro-worker-test-artifacts';
const tableName = 'kiro-worker-production-locks';
```

## Deployment Pipeline

### Infrastructure Deployment (AWS CDK)

**Deployment Order** (MUST be followed):

1. **Core Infrastructure Stack**
   - S3 buckets for artifacts
   - DynamoDB tables for locking
   - CloudWatch log groups
   - KMS keys for encryption
   - No dependencies

2. **Secrets Configuration Stack**
   - Secrets Manager secrets
   - Parameter Store parameters
   - Depends on: Core (KMS key)

3. **Work Item Poller Stack**
   - Lambda function
   - EventBridge scheduled rule
   - SQS Dead Letter Queue
   - Depends on: Core (DynamoDB), Secrets (API tokens)

4. **CodeBuild Projects Stack**
   - CodeBuild projects
   - IAM roles and permissions
   - Depends on: Core (S3), Secrets (credentials)

5. **Monitoring and Alerting Stack**
   - CloudWatch alarms
   - SNS topics and subscriptions
   - Depends on: CodeBuild, Poller (metrics)

**Code Requirement**: When adding new infrastructure resources:
- Place in appropriate stack based on responsibility
- Respect stack dependencies
- Use CDK constructs for reusability
- Export necessary values via CfnOutput
- Add corresponding tests

### Application Deployment (CodeBuild)

**Deployment Method**: Application code is deployed via CodeBuild execution, not separately deployed.

**Build Process**:
1. CodeBuild pulls latest code from repository
2. Installs dependencies (`npm install`)
3. Runs tests (`npm test`)
4. Validates coverage ≥80%
5. Executes Kiro CLI tasks
6. Updates pull request with results

**Code Requirement**: All application code must:
- Be committed to the repository
- Pass all tests before merge
- Maintain ≥80% code coverage
- Build successfully with `npm run build`
- Work with the buildspec.yml configuration

## Deployment Workflow

### Standard Deployment Flow

```
Developer → Feature Branch → Pull Request → Code Review → Merge to Main
                                                              ↓
                                                    Infrastructure Update
                                                              ↓
                                                    CDK Deploy (if needed)
                                                              ↓
                                                    Application Available
```

### Infrastructure Changes

When infrastructure changes are needed:

```bash
# 1. Make changes to CDK code in infrastructure/
# 2. Test locally
cd infrastructure
npm test

# 3. Synthesize to review changes
cdk synth --context environment=test

# 4. Review diff
cdk diff --context environment=test

# 5. Deploy to test environment
cdk deploy --all --context environment=test

# 6. Verify deployment
# Run verification scripts

# 7. Deploy to staging
cdk deploy --all --context environment=staging

# 8. Deploy to production (after approval)
cdk deploy --all --context environment=production
```

**Code Requirement**: Infrastructure changes must:
- Include corresponding tests
- Pass snapshot tests
- Be reviewed via `cdk diff` before deployment
- Be deployed to test environment first
- Include rollback plan

### Application Changes

When application code changes are needed:

```bash
# 1. Make changes to src/
# 2. Write/update tests
# 3. Run tests locally
npm test
npm run test:coverage

# 4. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin feature/my-feature

# 5. Create pull request
# 6. Wait for CI/CD to pass
# 7. Get code review approval
# 8. Merge to main

# Application is automatically available on next CodeBuild execution
```

**Code Requirement**: Application changes must:
- Pass all tests (100% success rate)
- Maintain ≥80% code coverage
- Follow TypeScript standards
- Include error handling
- Be backward compatible (or include migration plan)

## Configuration Management

### Environment Variables

**CodeBuild Environment Variables** (set by Work Item Poller):
- `ENVIRONMENT`: test | staging | production
- `BRANCH_NAME`: Feature branch to work on
- `SPEC_PATH`: Path to spec folder
- `COVERAGE_THRESHOLD`: Minimum coverage (default: 80)

**Code Requirement**: When adding new environment variables:
- Document in buildspec.yml
- Add to environment configuration
- Provide sensible defaults
- Validate at runtime
- Never hardcode values

Example:
```typescript
// Good - environment variable with validation
const coverageThreshold = parseInt(
  process.env.COVERAGE_THRESHOLD || '80',
  10
);

if (coverageThreshold < 0 || coverageThreshold > 100) {
  throw new ValidationError('Coverage threshold must be between 0 and 100');
}

// Bad - hardcoded value
const coverageThreshold = 80;
```

### Secrets Management

**Storage**: All secrets MUST be stored in AWS Secrets Manager.

**Naming Convention**:
```
/kiro-worker/{environment}/{secret-name}

Examples:
- kiro-worker-test-github-token
- kiro-worker-production-git-credentials
```

**Code Requirement**: When accessing secrets:
- Use AWS SDK v3 Secrets Manager client
- Cache secrets appropriately (not per-request)
- Handle secret rotation
- Never log secret values
- Sanitize errors that might contain secrets

Example:
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class SecretManager {
  private readonly client: SecretsManagerClient;
  private readonly cache = new Map<string, string>();
  
  constructor(private readonly environment: string) {
    this.client = new SecretsManagerClient({ region: 'us-east-1' });
  }
  
  async getSecret(secretName: string): Promise<string> {
    // Check cache first
    if (this.cache.has(secretName)) {
      return this.cache.get(secretName)!;
    }
    
    const secretId = `kiro-worker-${this.environment}-${secretName}`;
    
    try {
      const command = new GetSecretValueCommand({ SecretId: secretId });
      const response = await this.client.send(command);
      const secretValue = response.SecretString || '';
      
      // Cache for 5 minutes
      this.cache.set(secretName, secretValue);
      setTimeout(() => this.cache.delete(secretName), 5 * 60 * 1000);
      
      return secretValue;
    } catch (error) {
      // Never log the error directly (might contain secret)
      throw new Error(`Failed to retrieve secret: ${secretName}`);
    }
  }
}
```

### Parameters Management

**Storage**: Configuration parameters MUST be stored in AWS Systems Manager Parameter Store.

**Naming Convention**:
```
/kiro-worker/{environment}/{parameter-name}

Examples:
- /kiro-worker/test/github-project-config
- /kiro-worker/production/polling-interval
```

**Code Requirement**: When accessing parameters:
- Use AWS SDK v3 SSM client
- Cache parameters appropriately
- Validate parameter values
- Provide defaults for optional parameters

## Deployment Validation

### Pre-Deployment Validation

**MUST be performed before any deployment**:

1. **Code Quality Checks**
   - [ ] All tests pass: `npm test`
   - [ ] Coverage ≥80%: `npm run test:coverage`
   - [ ] Linting passes: `npm run lint`
   - [ ] Build succeeds: `npm run build`
   - [ ] No TypeScript errors: `tsc --noEmit`

2. **Infrastructure Validation**
   - [ ] CDK synth succeeds: `cdk synth`
   - [ ] Infrastructure tests pass: `cd infrastructure && npm test`
   - [ ] No security issues in `cdk diff`
   - [ ] Stack dependencies are correct

3. **Security Validation**
   - [ ] No secrets in code
   - [ ] IAM permissions follow least privilege
   - [ ] Encryption enabled for all resources
   - [ ] No public access to S3 buckets
   - [ ] Security groups properly configured

**Code Requirement**: Add validation scripts to package.json:

```json
{
  "scripts": {
    "validate": "npm run lint && npm test && npm run build",
    "validate:infrastructure": "cd infrastructure && npm test && cdk synth",
    "validate:all": "npm run validate && npm run validate:infrastructure"
  }
}
```

### Post-Deployment Validation

**MUST be performed after deployment**:

1. **Infrastructure Validation**
   - [ ] All stacks deployed successfully
   - [ ] Stack outputs are correct
   - [ ] Resources are accessible
   - [ ] IAM roles have correct permissions

2. **Application Validation**
   - [ ] Lambda function invokes successfully
   - [ ] CodeBuild project can be triggered
   - [ ] Secrets are accessible
   - [ ] DynamoDB table is accessible
   - [ ] S3 bucket is accessible

3. **Integration Validation**
   - [ ] Lambda can query GitHub Projects API
   - [ ] Lambda can trigger CodeBuild
   - [ ] CodeBuild can access secrets
   - [ ] CodeBuild can push to Git
   - [ ] CloudWatch alarms are active

**Code Requirement**: Create validation scripts:

```typescript
// infrastructure/lib/utils/post-deployment-validator.ts
export class PostDeploymentValidator {
  async validateDeployment(environment: string): Promise<ValidationResult> {
    const results: ValidationResult = {
      passed: [],
      failed: []
    };
    
    // Validate S3 bucket
    try {
      await this.validateS3Bucket(environment);
      results.passed.push('S3 bucket accessible');
    } catch (error) {
      results.failed.push(`S3 bucket validation failed: ${error.message}`);
    }
    
    // Validate DynamoDB table
    try {
      await this.validateDynamoDBTable(environment);
      results.passed.push('DynamoDB table accessible');
    } catch (error) {
      results.failed.push(`DynamoDB validation failed: ${error.message}`);
    }
    
    // ... more validations
    
    return results;
  }
}
```

## Rollback Strategy

### Automatic Rollback Triggers

**Infrastructure rollback is triggered when**:
- CloudFormation stack deployment fails
- Post-deployment validation fails
- Critical alarms fire within 15 minutes of deployment

**Application rollback is triggered when**:
- Build failure rate > 50% within 1 hour
- Test failure rate > 25% within 1 hour
- Coverage drops below 70%

### Rollback Procedures

**Infrastructure Rollback**:

```bash
# Option 1: CDK destroy and redeploy previous version
git checkout <previous-version-tag>
cd infrastructure
cdk deploy --all --context environment=production

# Option 2: CloudFormation rollback
aws cloudformation rollback-stack --stack-name KiroWorkerCodeBuild

# Option 3: Manual stack deletion and recreation
cdk destroy KiroWorkerCodeBuild --context environment=production --force
git checkout <previous-version-tag>
cdk deploy KiroWorkerCodeBuild --context environment=production
```

**Application Rollback**:

Application code is deployed via CodeBuild, so rollback involves:
1. Revert the commit in Git
2. Merge revert to main branch
3. Next CodeBuild execution uses reverted code

```bash
# Revert specific commit
git revert <commit-hash>
git push origin main

# Or revert to previous version
git reset --hard <previous-commit>
git push --force origin main  # Use with caution
```

**Code Requirement**: All code must support rollback:
- Database migrations must be reversible
- API changes must be backward compatible
- Configuration changes must have defaults
- Feature flags for gradual rollout

### Rollback Testing

**MUST test rollback procedures**:
- Test rollback in test environment monthly
- Document rollback time (target: < 15 minutes)
- Verify data integrity after rollback
- Test partial rollback (single stack)

## Monitoring and Alerting

### Deployment Metrics

**Track these metrics for every deployment**:
- Deployment duration
- Deployment success rate
- Rollback frequency
- Time to rollback
- Post-deployment error rate

**Code Requirement**: Emit custom CloudWatch metrics:

```typescript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

export class DeploymentMetrics {
  private readonly client: CloudWatchClient;
  
  constructor(private readonly environment: string) {
    this.client = new CloudWatchClient({ region: 'us-east-1' });
  }
  
  async recordDeploymentDuration(durationMs: number): Promise<void> {
    const command = new PutMetricDataCommand({
      Namespace: 'KiroWorker/Deployment',
      MetricData: [
        {
          MetricName: 'DeploymentDuration',
          Value: durationMs,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'Environment', Value: this.environment }
          ]
        }
      ]
    });
    
    await this.client.send(command);
  }
}
```

### Deployment Alarms

**Required CloudWatch alarms**:
- Deployment failure rate > 25%
- Rollback frequency > 2 per day
- Post-deployment error rate > 10%
- Build duration > 60 minutes

**Code Requirement**: Define alarms in CDK:

```typescript
const deploymentFailureAlarm = new cloudwatch.Alarm(this, 'DeploymentFailureAlarm', {
  alarmName: `kiro-worker-${environment}-deployment-failures`,
  metric: new cloudwatch.Metric({
    namespace: 'KiroWorker/Deployment',
    metricName: 'DeploymentFailure',
    statistic: 'Sum',
    period: cdk.Duration.hours(1)
  }),
  threshold: 3,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
});

deploymentFailureAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

## Deployment Best Practices

### 1. Incremental Deployments

**ALWAYS deploy incrementally**:
- Deploy to test environment first
- Validate thoroughly in test
- Deploy to staging
- Validate in staging
- Deploy to production (with approval)

**Code Requirement**: Never skip environments:

```typescript
// Good - respects deployment order
const DEPLOYMENT_ORDER = ['test', 'staging', 'production'];

function validateDeploymentOrder(
  currentEnv: string,
  previousEnv: string
): void {
  const currentIndex = DEPLOYMENT_ORDER.indexOf(currentEnv);
  const previousIndex = DEPLOYMENT_ORDER.indexOf(previousEnv);
  
  if (currentIndex <= previousIndex) {
    throw new Error('Must deploy to environments in order');
  }
}

// Bad - allows skipping environments
function deploy(environment: string): void {
  // No validation of deployment order
}
```

### 2. Blue-Green Deployments

For major changes, use blue-green deployment:
1. Deploy new version alongside old version
2. Route small percentage of traffic to new version
3. Monitor metrics and errors
4. Gradually increase traffic to new version
5. Decommission old version

**Code Requirement**: Support multiple versions:
- Use version tags in resource names
- Support traffic splitting
- Implement health checks

### 3. Feature Flags

Use feature flags for gradual rollout:

```typescript
export class FeatureFlags {
  private readonly flags = new Map<string, boolean>();
  
  async isEnabled(featureName: string, environment: string): Promise<boolean> {
    // Check Parameter Store for feature flag
    const paramName = `/kiro-worker/${environment}/features/${featureName}`;
    const value = await this.getParameter(paramName);
    return value === 'true';
  }
}

// Usage
if (await featureFlags.isEnabled('new-retry-logic', environment)) {
  // Use new retry logic
} else {
  // Use old retry logic
}
```

### 4. Database Migrations

**ALWAYS make migrations backward compatible**:
- Add columns (don't remove)
- Make new columns nullable
- Deploy code that works with both schemas
- Remove old columns in separate deployment

**Code Requirement**: Version migrations:

```typescript
export interface Migration {
  version: number;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async () => {
      // Add new column
      await dynamodb.updateTable({
        TableName: 'locks',
        AttributeDefinitions: [
          { AttributeName: 'newColumn', AttributeType: 'S' }
        ]
      });
    },
    down: async () => {
      // Remove column (if safe)
    }
  }
];
```

### 5. Deployment Documentation

**MUST document every deployment**:
- What changed
- Why it changed
- Deployment steps
- Rollback steps
- Validation steps
- Known issues

**Code Requirement**: Update CHANGELOG.md:

```markdown
## [1.2.0] - 2026-01-27

### Added
- New retry logic with exponential backoff
- Feature flag support for gradual rollout

### Changed
- Updated DynamoDB table schema (backward compatible)
- Increased Lambda timeout to 15 minutes

### Fixed
- Race condition in lock acquisition

### Deployment Notes
- Deploy to test first, validate for 24 hours
- Enable feature flag in staging after validation
- Production deployment requires approval

### Rollback Plan
- Disable feature flag if issues occur
- Revert to version 1.1.0 if critical issues
```

## Deployment Checklist

Use this checklist for every deployment:

### Pre-Deployment
- [ ] All tests pass locally
- [ ] Code coverage ≥80%
- [ ] Code reviewed and approved
- [ ] Infrastructure tests pass
- [ ] Security scan completed
- [ ] Deployment plan documented
- [ ] Rollback plan documented
- [ ] Stakeholders notified

### Deployment
- [ ] Deploy to test environment
- [ ] Validate in test (run validation scripts)
- [ ] Monitor test environment for 24 hours
- [ ] Deploy to staging environment
- [ ] Validate in staging
- [ ] Monitor staging for 24 hours
- [ ] Get production deployment approval
- [ ] Deploy to production
- [ ] Validate in production immediately

### Post-Deployment
- [ ] All validation checks pass
- [ ] No critical alarms firing
- [ ] Metrics within normal ranges
- [ ] Logs show no errors
- [ ] Stakeholders notified of completion
- [ ] Documentation updated
- [ ] Deployment retrospective scheduled

## Compliance Requirements

### Code Alignment with Deployment Strategy

**ALL code must**:
- Be environment-aware (use environment variables)
- Support multiple environments (test, staging, production)
- Be deployable via CDK (infrastructure) or CodeBuild (application)
- Include rollback support
- Include validation tests
- Follow security best practices
- Be monitored with CloudWatch metrics and alarms

### Deployment Approval Requirements

**Test Environment**:
- No approval required
- Deploy on-demand

**Staging Environment**:
- Requires: Successful test deployment + 24 hour validation
- Approval: Tech lead or senior developer

**Production Environment**:
- Requires: Successful staging deployment + 24 hour validation
- Approval: Engineering manager + product owner
- Timing: During maintenance window (if applicable)

## Summary

The deployment strategy ensures:
- ✅ Safe, incremental deployments across environments
- ✅ Complete environment isolation
- ✅ Automated validation at every step
- ✅ Fast rollback capability (< 15 minutes)
- ✅ Comprehensive monitoring and alerting
- ✅ Clear approval process
- ✅ Documentation of all changes

**Remember**: All code must align with this deployment strategy. Code that doesn't support the deployment model will be rejected during code review.
