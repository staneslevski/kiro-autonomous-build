# CD Pipeline Rollback Guide

## Overview

This guide documents the automated and manual rollback procedures for the Kiro CodeBuild Worker CD Pipeline. Rollback capabilities ensure that failed deployments can be quickly reverted to the last known good state, minimizing downtime and impact to users.

## Rollback Architecture

### Automated Rollback System

The CD pipeline includes a comprehensive automated rollback system that monitors deployments and triggers rollback when issues are detected:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Deployment Monitoring                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  CloudWatch  │  │  Health      │  │  Test        │          │
│  │    Alarms    │  │  Checks      │  │  Results     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                            ▼                                     │
│                  ┌──────────────────┐                           │
│                  │   EventBridge    │                           │
│                  │      Rule        │                           │
│                  └─────────┬────────┘                           │
│                            │                                     │
│                            ▼                                     │
│                  ┌──────────────────┐                           │
│                  │    Rollback      │                           │
│                  │     Lambda       │                           │
│                  └─────────┬────────┘                           │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Stage      │  │    Full      │  │  Validation  │         │
│  │  Rollback    │  │  Rollback    │  │   & Notify   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Rollback Levels

The system supports two levels of rollback:

1. **Stage-Level Rollback**: Reverts only the failed environment (test, staging, or production)
2. **Full Rollback**: Reverts all environments to the last known good deployment

The system attempts stage-level rollback first and falls back to full rollback if stage-level fails.

## Automated Rollback Process

### Rollback Triggers

Automated rollback is triggered by:

1. **Test Failures**:
   - Unit test failures (coverage < 80%)
   - Integration test failures
   - E2E test failures
   - Security scan failures (CRITICAL or HIGH severity)

2. **CloudWatch Alarms**:
   - Build failure rate > 50% (3 failures in 1 hour)
   - Deployment duration > 60 minutes
   - Application error rate spikes
   - Resource utilization anomalies

3. **Health Check Failures**:
   - Post-deployment health checks fail
   - Application endpoints unreachable
   - Database connection failures
   - Critical service degradation

### Rollback Flow

When a rollback is triggered:

1. **Detection** (< 1 minute):
   - EventBridge rule detects alarm state change to ALARM
   - Rollback Lambda function is invoked
   - Current deployment record retrieved from DynamoDB

2. **Stage-Level Rollback** (5-10 minutes):
   - Identify the failed environment (test, staging, or production)
   - Retrieve last known good deployment for that environment
   - Revert infrastructure using CDK (if infrastructure changed)
   - Revert application code using CodeBuild
   - Run health checks to verify rollback success

3. **Validation** (1-2 minutes):
   - Wait 1 minute for stabilization
   - Check all CloudWatch alarms (must be OK)
   - Run health checks (must pass)
   - Verify deployed version matches target version

4. **Fallback to Full Rollback** (if stage rollback fails):
   - Revert all environments (production → staging → test)
   - Use last known good deployment across all environments
   - Validate each environment after rollback

5. **Notification** (< 1 minute):
   - Send SNS notification with rollback details
   - Update deployment record in DynamoDB
   - Publish rollback metrics to CloudWatch

**Total Time**: Stage-level rollback typically completes in 7-13 minutes. Full rollback takes 15-25 minutes.

### Rollback Validation

After rollback completes, the system validates:

- ✅ All CloudWatch alarms in OK state
- ✅ Health checks pass
- ✅ Application endpoints respond correctly
- ✅ Deployed version matches expected version
- ✅ No errors in application logs

If validation fails, the system:
- Sends critical alert via SNS
- Marks rollback as failed in DynamoDB
- Requires manual intervention

## Manual Rollback Procedures

### When to Use Manual Rollback

Use manual rollback when:

- Automated rollback failed or is unavailable
- Rollback Lambda function is not working
- Need to rollback to a specific version (not last known good)
- Need to rollback only infrastructure or only application (not both)
- Automated rollback is taking too long

### Prerequisites for Manual Rollback

Before performing manual rollback:

1. **Identify Target Version**:
   ```bash
   # Query DynamoDB for last known good deployment
   aws dynamodb query \
     --table-name kiro-pipeline-$ENVIRONMENT-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env AND #status = :status" \
     --expression-attribute-names '{"#status":"status"}' \
     --expression-attribute-values '{":env":{"S":"'$ENVIRONMENT'"},":status":{"S":"succeeded"}}' \
     --scan-index-forward false \
     --limit 1 \
     --region $AWS_REGION
   ```

2. **Verify Git Commit**:
   ```bash
   # Get commit hash from deployment record
   COMMIT_HASH="<commit-hash-from-dynamodb>"
   
   # Verify commit exists
   git show $COMMIT_HASH
   ```

3. **Check Current State**:
   ```bash
   # Get current pipeline state
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   
   # Check current alarms
   aws cloudwatch describe-alarms \
     --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
     --state-value ALARM \
     --region $AWS_REGION
   ```

### Manual Rollback Steps

#### Option 1: Rollback via Pipeline (Recommended)

This method uses the existing pipeline to deploy the previous version:

```bash
# Step 1: Create rollback branch from last known good commit
COMMIT_HASH="<last-known-good-commit>"
git checkout $COMMIT_HASH
git checkout -b rollback/$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)

# Step 2: Push rollback branch
git push origin rollback/$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)

# Step 3: Create pull request to main
# - Title: "Rollback: Revert to <commit-hash>"
# - Description: Include reason for rollback and incident details
# - Get approval and merge to main

# Step 4: Monitor pipeline execution
aws codepipeline get-pipeline-state \
  --name kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION

# Step 5: Verify deployment
./infrastructure/validate-deployment.sh
```

#### Option 2: Direct CDK Rollback (Infrastructure Only)

Use this when only infrastructure needs to be rolled back:

```bash
# Step 1: Checkout last known good commit
COMMIT_HASH="<last-known-good-commit>"
git checkout $COMMIT_HASH

# Step 2: Review infrastructure changes
cd infrastructure
cdk diff --all --context environment=$ENVIRONMENT

# Step 3: Deploy previous infrastructure
cdk deploy --all \
  --context environment=$ENVIRONMENT \
  --require-approval never

# Step 4: Verify deployment
./validate-deployment.sh

# Step 5: Update deployment record
aws dynamodb put-item \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --item '{
    "deploymentId": {"S": "manual-rollback-'$(date +%s)'"},
    "environment": {"S": "'$ENVIRONMENT'"},
    "version": {"S": "'$COMMIT_HASH'"},
    "status": {"S": "succeeded"},
    "deploymentType": {"S": "manual-rollback"},
    "startTime": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "endTime": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
  }' \
  --region $AWS_REGION
```

#### Option 3: Emergency Rollback (All Environments)

Use this for critical production issues requiring immediate rollback:

```bash
# Step 1: Stop current pipeline execution
EXECUTION_ID=$(aws codepipeline get-pipeline-state \
  --name kiro-pipeline-$ENVIRONMENT \
  --query 'stageStates[0].latestExecution.pipelineExecutionId' \
  --output text \
  --region $AWS_REGION)

aws codepipeline stop-pipeline-execution \
  --pipeline-name kiro-pipeline-$ENVIRONMENT \
  --pipeline-execution-id $EXECUTION_ID \
  --reason "Emergency rollback" \
  --region $AWS_REGION

# Step 2: Rollback production first
export ENVIRONMENT=production
COMMIT_HASH="<last-known-good-commit>"
git checkout $COMMIT_HASH
cd infrastructure
cdk deploy --all --context environment=production --require-approval never

# Step 3: Rollback staging
export ENVIRONMENT=staging
cdk deploy --all --context environment=staging --require-approval never

# Step 4: Rollback test
export ENVIRONMENT=test
cdk deploy --all --context environment=test --require-approval never

# Step 5: Verify all environments
for ENV in production staging test; do
  export ENVIRONMENT=$ENV
  ./validate-deployment.sh
done

# Step 6: Send notification
aws sns publish \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-production-rollbacks \
  --subject "Emergency Rollback Completed" \
  --message "All environments rolled back to commit $COMMIT_HASH" \
  --region $AWS_REGION
```

### Post-Rollback Validation

After manual rollback, perform these validation steps:

```bash
# 1. Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
  --state-value ALARM \
  --region $AWS_REGION

# Expected: No alarms in ALARM state

# 2. Run health checks
curl -f https://your-app-endpoint/health || echo "Health check failed"

# 3. Check application logs
aws logs tail /aws/codebuild/kiro-worker-$ENVIRONMENT \
  --since 5m \
  --region $AWS_REGION

# 4. Verify deployment record
aws dynamodb get-item \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --key '{"deploymentId":{"S":"<deployment-id>"}}' \
  --region $AWS_REGION

# 5. Check metrics
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name DeploymentSuccess \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region $AWS_REGION
```

## Rollback Scenarios and Solutions

### Scenario 1: Test Failure in Test Environment

**Trigger**: Unit tests fail with coverage < 80%

**Automated Response**:
- Stage-level rollback of test environment
- Revert to last known good deployment
- Notify development team

**Manual Steps** (if automated rollback fails):
```bash
export ENVIRONMENT=test
# Follow Option 2: Direct CDK Rollback
```

**Prevention**:
- Run tests locally before pushing
- Use pre-commit hooks
- Review test coverage reports

### Scenario 2: Alarm Triggered in Production

**Trigger**: Error rate alarm enters ALARM state

**Automated Response**:
- Stage-level rollback of production environment
- Revert infrastructure and application
- Notify on-call team via SNS

**Manual Steps** (if automated rollback fails):
```bash
export ENVIRONMENT=production
# Follow Option 3: Emergency Rollback
```

**Prevention**:
- Thorough testing in staging
- Gradual rollout strategies
- Canary deployments

### Scenario 3: Infrastructure Change Breaks Application

**Trigger**: Health checks fail after infrastructure deployment

**Automated Response**:
- Stage-level rollback of affected environment
- Revert infrastructure using CDK
- Validate health checks pass

**Manual Steps**:
```bash
# Rollback infrastructure only
export ENVIRONMENT=<affected-environment>
COMMIT_HASH="<last-known-good-commit>"
git checkout $COMMIT_HASH
cd infrastructure
cdk deploy --all --context environment=$ENVIRONMENT
```

**Prevention**:
- Test infrastructure changes in test environment first
- Use CDK diff to review changes
- Implement infrastructure tests

### Scenario 4: Rollback Lambda Failure

**Trigger**: Rollback Lambda function fails or times out

**Symptoms**:
- Rollback notifications not sent
- Deployment record not updated
- Alarms still in ALARM state

**Manual Steps**:
```bash
# 1. Check Lambda logs
aws logs tail /aws/lambda/kiro-pipeline-$ENVIRONMENT-rollback \
  --since 30m \
  --follow \
  --region $AWS_REGION

# 2. Identify error cause
# Common issues:
# - Insufficient IAM permissions
# - DynamoDB throttling
# - CodePipeline API errors

# 3. Perform manual rollback
# Follow Option 1 or Option 2 depending on issue

# 4. Fix Lambda function if needed
cd infrastructure
# Update lib/lambda/rollback-handler.ts
cdk deploy kiro-worker-$ENVIRONMENT-monitoring \
  --context environment=$ENVIRONMENT
```

### Scenario 5: Partial Rollback (Some Environments Succeed, Others Fail)

**Trigger**: Full rollback initiated but some environments fail

**Symptoms**:
- Production rolled back successfully
- Staging rollback failed
- Test environment unchanged

**Manual Steps**:
```bash
# 1. Identify which environments need rollback
aws dynamodb query \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"staging"}}' \
  --scan-index-forward false \
  --limit 5 \
  --region $AWS_REGION

# 2. Rollback failed environments individually
export ENVIRONMENT=staging
# Follow Option 2: Direct CDK Rollback

# 3. Verify consistency across environments
for ENV in production staging test; do
  export ENVIRONMENT=$ENV
  git log -1 --format="%H" # Should match across environments
done
```

## Rollback Troubleshooting

### Common Issues

#### Issue: "No last known good deployment found"

**Cause**: No successful deployments recorded in DynamoDB

**Solution**:
```bash
# Check deployment history
aws dynamodb scan \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --filter-expression "#status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{":status":{"S":"succeeded"}}' \
  --region $AWS_REGION

# If no successful deployments, deploy from known good commit
git checkout <known-good-commit>
cd infrastructure
./deploy-pipeline.sh
```

#### Issue: "CDK diff shows no changes but application still broken"

**Cause**: Application code issue, not infrastructure

**Solution**:
```bash
# Rollback application code only
# Use Option 1: Rollback via Pipeline
# This will rebuild and redeploy application without infrastructure changes
```

#### Issue: "Rollback validation fails"

**Cause**: Alarms still in ALARM state after rollback

**Solution**:
```bash
# 1. Wait for alarm evaluation period
sleep 300 # Wait 5 minutes

# 2. Check alarm state again
aws cloudwatch describe-alarms \
  --alarm-names kiro-pipeline-$ENVIRONMENT-build-failures \
  --region $AWS_REGION

# 3. If still in ALARM, investigate root cause
aws logs tail /aws/codebuild/kiro-worker-$ENVIRONMENT \
  --since 10m \
  --region $AWS_REGION

# 4. May need to rollback further or fix underlying issue
```

#### Issue: "Insufficient permissions for rollback"

**Cause**: IAM role lacks required permissions

**Solution**:
```bash
# Check current IAM identity
aws sts get-caller-identity

# Verify rollback Lambda role has permissions
aws iam get-role-policy \
  --role-name kiro-pipeline-$ENVIRONMENT-rollback-role \
  --policy-name RollbackPolicy \
  --region $AWS_REGION

# If permissions missing, update IAM policy
cd infrastructure
# Update lib/stacks/monitoring-alerting-stack.ts
cdk deploy kiro-worker-$ENVIRONMENT-monitoring
```

### Rollback Metrics and Monitoring

Monitor rollback effectiveness:

```bash
# Get rollback count
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name RollbackCount \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum \
  --region $AWS_REGION

# Get rollback duration
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name RollbackDuration \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Average,Maximum \
  --region $AWS_REGION

# View rollback history
aws dynamodb query \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env AND #status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{":env":{"S":"'$ENVIRONMENT'"},":status":{"S":"rolled_back"}}' \
  --region $AWS_REGION
```

## Best Practices

### Rollback Prevention

1. **Comprehensive Testing**:
   - Run full test suite locally before pushing
   - Maintain ≥80% code coverage
   - Include integration and E2E tests

2. **Gradual Rollout**:
   - Always deploy to test first
   - Validate in staging before production
   - Use manual approval for production

3. **Monitoring**:
   - Set appropriate alarm thresholds
   - Monitor key metrics continuously
   - Review CloudWatch dashboards regularly

4. **Code Review**:
   - Require peer review for all changes
   - Review infrastructure changes carefully
   - Use CDK diff to understand impact

### Rollback Execution

1. **Act Quickly**:
   - Rollback immediately when issues detected
   - Don't wait to investigate root cause
   - Investigate after service is restored

2. **Communicate**:
   - Notify stakeholders of rollback
   - Update incident tracking system
   - Document rollback reason

3. **Validate Thoroughly**:
   - Check all alarms after rollback
   - Run health checks
   - Monitor for 15-30 minutes post-rollback

4. **Document**:
   - Record rollback details in DynamoDB
   - Update incident report
   - Share lessons learned

### Post-Rollback

1. **Root Cause Analysis**:
   - Investigate what caused the failure
   - Review logs and metrics
   - Identify contributing factors

2. **Fix Forward**:
   - Create fix for the issue
   - Test thoroughly in test environment
   - Deploy fix through normal pipeline

3. **Improve**:
   - Update tests to catch similar issues
   - Adjust alarm thresholds if needed
   - Update documentation

4. **Review**:
   - Conduct post-incident review
   - Share findings with team
   - Update runbooks and procedures

## Rollback Checklist

Use this checklist when performing manual rollback:

### Pre-Rollback
- [ ] Identify last known good deployment
- [ ] Verify commit hash exists in Git
- [ ] Check current alarm states
- [ ] Notify stakeholders of rollback
- [ ] Create incident ticket

### During Rollback
- [ ] Stop current pipeline execution (if needed)
- [ ] Execute rollback procedure
- [ ] Monitor rollback progress
- [ ] Check for errors in logs
- [ ] Verify each step completes

### Post-Rollback
- [ ] Validate all alarms in OK state
- [ ] Run health checks
- [ ] Check application endpoints
- [ ] Verify deployment record updated
- [ ] Monitor for 15-30 minutes
- [ ] Send completion notification
- [ ] Update incident ticket
- [ ] Schedule post-incident review

## Emergency Contacts

In case of rollback issues:

- **On-Call Engineer**: Check PagerDuty/OpsGenie
- **DevOps Team**: devops@example.com
- **Engineering Manager**: manager@example.com
- **AWS Support**: Use AWS Support Center for infrastructure issues

## Related Documentation

- [CD Pipeline Deployment Guide](cd-pipeline-deployment.md)
- [CD Pipeline Monitoring Guide](../operations/cd-pipeline-monitoring.md)
- [CD Pipeline Runbook](../operations/cd-pipeline-runbook.md)
- [Incident Response Procedures](../operations/incident-response.md)

## Appendix

### Rollback Decision Tree

```
Issue Detected
    │
    ├─ Test Failure?
    │   └─ Yes → Automated stage rollback (test env)
    │
    ├─ Alarm in ALARM state?
    │   ├─ Test env → Automated stage rollback
    │   ├─ Staging env → Automated stage rollback
    │   └─ Production env → Automated stage rollback + escalate
    │
    ├─ Health Check Failure?
    │   └─ Yes → Automated stage rollback + investigate
    │
    ├─ Automated Rollback Failed?
    │   └─ Yes → Manual rollback (Option 1 or 2)
    │
    └─ Critical Production Issue?
        └─ Yes → Emergency rollback (Option 3)
```

### Rollback SLA

- **Detection Time**: < 1 minute (automated)
- **Stage Rollback Time**: 7-13 minutes
- **Full Rollback Time**: 15-25 minutes
- **Validation Time**: 1-2 minutes
- **Total Time to Recovery**: < 15 minutes (stage), < 30 minutes (full)

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-27 | Initial rollback guide |
