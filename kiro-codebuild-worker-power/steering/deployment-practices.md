# Deployment Practices

## Overview

This document defines deployment practices, infrastructure management standards, and operational procedures for the Kiro CodeBuild Worker project.

## Deployment Principles

### Core Principles

1. **Infrastructure as Code** - All infrastructure defined in code (AWS CDK)
2. **Immutable Infrastructure** - Replace rather than modify
3. **Automated Deployments** - Minimize manual intervention
4. **Environment Parity** - Keep environments as similar as possible
5. **Rollback Capability** - Always have a rollback plan
6. **Security First** - Apply security best practices at every layer
7. **Cost Optimization** - Monitor and optimize resource usage

## Environment Strategy

### Environment Tiers

**Test Environment**:
- Purpose: Development and testing
- Deployment frequency: Multiple times per day
- Data: Synthetic test data
- Monitoring: Basic monitoring
- Cost: Optimized for development

**Staging Environment**:
- Purpose: Pre-production validation
- Deployment frequency: Daily or per release
- Data: Anonymized production-like data
- Monitoring: Production-like monitoring
- Cost: Similar to production

**Production Environment**:
- Purpose: Live user traffic
- Deployment frequency: Controlled releases
- Data: Real production data
- Monitoring: Comprehensive monitoring and alerting
- Cost: Optimized for performance and reliability

### Environment Configuration

**Separate AWS Accounts** (Recommended):
```
├── dev-account (Test environment)
├── staging-account (Staging environment)
└── prod-account (Production environment)
```

**Single Account with Isolation** (Alternative):
```
├── kiro-worker-test-* (Test resources)
├── kiro-worker-staging-* (Staging resources)
└── kiro-worker-production-* (Production resources)
```

## AWS CDK Deployment

### CDK Project Structure

```
infrastructure/
├── bin/
│   └── kiro-worker.ts           # CDK app entry point
├── lib/
│   ├── stacks/
│   │   ├── core-infrastructure-stack.ts
│   │   ├── secrets-configuration-stack.ts
│   │   ├── work-item-poller-stack.ts
│   │   ├── codebuild-projects-stack.ts
│   │   └── monitoring-alerting-stack.ts
│   ├── constructs/
│   │   ├── codebuild-project-construct.ts
│   │   └── lambda-function-construct.ts
│   └── config/
│       └── environments.ts
├── test/
│   └── stacks/
└── cdk.json
```

### Stack Dependencies

**Deployment Order**:
1. Core Infrastructure Stack (S3, DynamoDB, CloudWatch Logs)
2. Secrets Configuration Stack (Secrets Manager, KMS)
3. Work Item Poller Stack (Lambda, EventBridge)
4. CodeBuild Projects Stack (CodeBuild projects)
5. Monitoring & Alerting Stack (CloudWatch Alarms, SNS)

### CDK Commands

**Synthesize CloudFormation**:
```bash
cd infrastructure
cdk synth --context environment=test
```

**Deploy Single Stack**:
```bash
cdk deploy KiroWorkerCore --context environment=test
```

**Deploy All Stacks**:
```bash
cdk deploy --all --context environment=test
```

**Show Differences**:
```bash
cdk diff --context environment=production
```

**Destroy Stacks**:
```bash
cdk destroy --all --context environment=test
```

## Pre-Deployment Checklist

### Before Any Deployment

- [ ] All tests pass locally
- [ ] Code coverage ≥ 80%
- [ ] CDK synth succeeds without errors
- [ ] CDK diff reviewed and understood
- [ ] IAM permissions validated
- [ ] Secrets are configured (if new)
- [ ] Rollback plan documented
- [ ] Team notified of deployment
- [ ] Monitoring dashboards ready

### Before Production Deployment

- [ ] Successfully deployed to test environment
- [ ] Successfully deployed to staging environment
- [ ] Integration tests pass in staging
- [ ] Performance tests pass in staging
- [ ] Security scan completed
- [ ] Change request approved (if required)
- [ ] Deployment window scheduled
- [ ] On-call engineer available
- [ ] Rollback procedure tested

## Deployment Process

### Test Environment Deployment

**Frequency**: Multiple times per day

**Process**:
1. Merge PR to main branch
2. CI/CD automatically deploys to test
3. Automated tests run post-deployment
4. Monitor for errors

**Automation**:
```yaml
# .github/workflows/deploy-test.yml
name: Deploy to Test

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Deploy to test
        run: |
          cd infrastructure
          npm ci
          cdk deploy --all --context environment=test --require-approval never
```

### Staging Environment Deployment

**Frequency**: Daily or per release

**Process**:
1. Tag release candidate (e.g., `v1.2.0-rc.1`)
2. Manually trigger staging deployment
3. Run integration tests
4. Perform smoke tests
5. Monitor for 24 hours
6. Approve for production

**Manual Trigger**:
```bash
# Tag release candidate
git tag v1.2.0-rc.1
git push origin v1.2.0-rc.1

# Deploy to staging
cd infrastructure
cdk deploy --all --context environment=staging
```

### Production Environment Deployment

**Frequency**: Controlled releases (weekly/bi-weekly)

**Process**:
1. Create release tag (e.g., `v1.2.0`)
2. Create deployment checklist
3. Schedule deployment window
4. Notify team and stakeholders
5. Deploy during low-traffic period
6. Monitor metrics closely
7. Verify functionality
8. Document deployment

**Deployment Script**:
```bash
#!/bin/bash
# deploy-production.sh

set -e

VERSION=$1
ENVIRONMENT="production"

echo "Deploying version $VERSION to $ENVIRONMENT"

# Validate version tag exists
if ! git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "Error: Version tag $VERSION does not exist"
  exit 1
fi

# Checkout version
git checkout "$VERSION"

# Run tests
npm test
npm run test:coverage

# Deploy infrastructure
cd infrastructure
npm ci
cdk synth --context environment=$ENVIRONMENT
cdk diff --context environment=$ENVIRONMENT

# Confirm deployment
read -p "Deploy to production? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Deployment cancelled"
  exit 1
fi

# Deploy
cdk deploy --all --context environment=$ENVIRONMENT

echo "Deployment complete. Monitor dashboards for issues."
```

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- Critical functionality is broken
- Security vulnerability introduced
- Data corruption detected
- Performance degradation > 50%
- Error rate > 10%

### Rollback Methods

**Method 1: CloudFormation Rollback**
```bash
# Automatic rollback on stack update failure
cdk deploy --rollback --context environment=production
```

**Method 2: Redeploy Previous Version**
```bash
# Checkout previous version
git checkout v1.1.0

# Deploy previous version
cd infrastructure
cdk deploy --all --context environment=production
```

**Method 3: Manual Resource Revert**
```bash
# For specific resource changes
aws cloudformation update-stack \
  --stack-name KiroWorkerCodeBuild \
  --use-previous-template \
  --parameters ParameterKey=BuildImage,UsePreviousValue=true
```

### Post-Rollback Actions

1. Verify system functionality
2. Monitor metrics for stability
3. Document rollback reason
4. Create incident report
5. Plan fix and redeployment

## Secret Management

### Secrets Storage

**AWS Secrets Manager**:
- GitHub API tokens
- Git credentials
- Third-party API keys

**AWS Systems Manager Parameter Store**:
- Configuration values
- Non-sensitive parameters
- Environment-specific settings

### Secret Rotation

**Rotation Schedule**:
- API tokens: Every 90 days
- Git credentials: Every 90 days
- Encryption keys: Annually

**Rotation Process**:
1. Generate new secret
2. Store in Secrets Manager with new version
3. Update application to use new secret
4. Verify functionality
5. Deprecate old secret after 7 days
6. Delete old secret after 30 days

### Secret Configuration

**Initial Setup**:
```bash
# Create GitHub token secret
aws secretsmanager create-secret \
  --name /kiro-worker/production/github-token \
  --description "GitHub API token for Kiro Worker" \
  --secret-string "ghp_xxxxxxxxxxxx"

# Create Git credentials secret
aws secretsmanager create-secret \
  --name /kiro-worker/production/git-credentials \
  --description "Git repository credentials" \
  --secret-string '{"username":"git","password":"xxxx"}'
```

## Monitoring and Alerting

### Key Metrics

**Build Metrics**:
- Build success rate
- Build duration (p50, p95, p99)
- Build failure rate
- Queue time

**Operation Metrics**:
- Git operation failures
- Test failure rate
- Coverage percentage
- PR creation success rate

**Resource Metrics**:
- Lambda invocation count
- Lambda error rate
- DynamoDB read/write capacity
- S3 storage usage

### CloudWatch Alarms

**Critical Alarms** (Page on-call):
- Build failure rate > 50% over 5 minutes
- Lambda error rate > 10% over 5 minutes
- DynamoDB throttling detected
- Secrets Manager access denied

**Warning Alarms** (Email notification):
- Build failure rate > 25% over 10 minutes
- Average build duration > 30 minutes
- Coverage percentage < 85%
- Lambda duration > 10 minutes

### Alarm Configuration

```typescript
// Example alarm configuration
const buildFailureAlarm = new cloudwatch.Alarm(this, 'BuildFailureAlarm', {
  alarmName: `kiro-worker-${environment}-build-failures`,
  metric: project.metricFailedBuilds({
    statistic: 'Sum',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 3,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});

buildFailureAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

## Cost Optimization

### Cost Monitoring

**Set Up Budgets**:
```bash
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

**Budget Configuration**:
```json
{
  "BudgetName": "KiroWorkerMonthly",
  "BudgetLimit": {
    "Amount": "500",
    "Unit": "USD"
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```

### Cost Optimization Strategies

**CodeBuild**:
- Use SMALL compute type for most builds
- Enable caching for dependencies
- Set appropriate timeout limits
- Use spot instances for non-critical builds

**Lambda**:
- Right-size memory allocation
- Use appropriate timeout values
- Enable Lambda Insights selectively
- Archive old logs to S3 Glacier

**DynamoDB**:
- Use on-demand billing for variable workloads
- Enable auto-scaling for provisioned capacity
- Set appropriate TTL for temporary data
- Use DynamoDB Streams efficiently

**S3**:
- Implement lifecycle policies
- Use Intelligent-Tiering for artifacts
- Enable S3 Transfer Acceleration selectively
- Compress artifacts before upload

## Security Best Practices

### IAM Permissions

**Principle of Least Privilege**:
```typescript
// Good - specific permissions
const role = new iam.Role(this, 'CodeBuildRole', {
  assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
  inlinePolicies: {
    'SecretsAccess': new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:${region}:${account}:secret:kiro-worker-*`
          ]
        })
      ]
    })
  }
});

// Bad - overly permissive
const role = new iam.Role(this, 'CodeBuildRole', {
  assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
  ]
});
```

### Encryption

**Enable Encryption Everywhere**:
- S3 buckets: Server-side encryption (SSE-S3 or SSE-KMS)
- DynamoDB tables: Encryption at rest
- Secrets Manager: KMS encryption
- CloudWatch Logs: KMS encryption
- EBS volumes: Encryption enabled

### Network Security

**VPC Configuration** (if needed):
```typescript
const vpc = new ec2.Vpc(this, 'KiroWorkerVPC', {
  maxAzs: 2,
  natGateways: 1,
  subnetConfiguration: [
    {
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC
    },
    {
      name: 'Private',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
    }
  ]
});

// CodeBuild in private subnet
const project = new codebuild.Project(this, 'Project', {
  vpc,
  subnetSelection: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
  }
});
```

### Security Scanning

**Pre-Deployment Scans**:
```bash
# Dependency vulnerability scan
npm audit

# CDK security scan
cdk synth | cfn-nag

# Infrastructure security scan
checkov -d infrastructure/
```

## Disaster Recovery

### Backup Strategy

**What to Backup**:
- DynamoDB tables (point-in-time recovery)
- S3 artifacts (versioning enabled)
- Secrets Manager secrets (automatic versioning)
- CloudFormation templates (version controlled)

**Backup Configuration**:
```typescript
// Enable point-in-time recovery
const table = new dynamodb.Table(this, 'LocksTable', {
  pointInTimeRecovery: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN
});

// Enable S3 versioning
const bucket = new s3.Bucket(this, 'ArtifactsBucket', {
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN
});
```

### Recovery Procedures

**Scenario 1: Accidental Stack Deletion**
1. Check CloudFormation stack status
2. Restore from CloudFormation template in git
3. Redeploy using CDK
4. Restore data from backups if needed

**Scenario 2: Data Corruption**
1. Identify corruption time
2. Restore DynamoDB table to point-in-time
3. Restore S3 objects from versions
4. Verify data integrity

**Scenario 3: Region Failure**
1. Activate disaster recovery plan
2. Deploy to backup region
3. Update DNS/routing
4. Verify functionality

## Operational Procedures

### Daily Operations

**Morning Checks**:
- Review CloudWatch dashboards
- Check alarm status
- Review build success rates
- Check cost trends

**Incident Response**:
1. Acknowledge alert
2. Assess severity
3. Investigate root cause
4. Implement fix or rollback
5. Document incident
6. Post-mortem review

### Maintenance Windows

**Scheduled Maintenance**:
- Announce 48 hours in advance
- Schedule during low-traffic periods
- Have rollback plan ready
- Monitor closely during and after

**Emergency Maintenance**:
- Notify team immediately
- Document reason and actions
- Minimize downtime
- Post-incident review

## Documentation

### Required Documentation

**Deployment Documentation**:
- Deployment procedures
- Rollback procedures
- Configuration guide
- Troubleshooting guide

**Operational Documentation**:
- Runbooks for common issues
- Incident response procedures
- Monitoring and alerting guide
- Cost optimization guide

**Architecture Documentation**:
- System architecture diagrams
- Data flow diagrams
- Security architecture
- Disaster recovery plan

## Summary

### Deployment Checklist

**Before Deployment**:
- [ ] Tests pass (≥80% coverage)
- [ ] CDK synth succeeds
- [ ] IAM permissions validated
- [ ] Secrets configured
- [ ] Rollback plan ready

**During Deployment**:
- [ ] Deploy to test first
- [ ] Deploy to staging second
- [ ] Validate in staging
- [ ] Deploy to production last
- [ ] Monitor metrics

**After Deployment**:
- [ ] Verify functionality
- [ ] Monitor for errors
- [ ] Check performance metrics
- [ ] Document deployment
- [ ] Update runbooks

**Remember**: Always have a rollback plan, monitor closely after deployment, and document everything.
