# CD Pipeline Runbook

## Overview

This runbook provides step-by-step procedures for common operational tasks and incident response for the Kiro CodeBuild Worker CD Pipeline.

## Quick Reference

### Emergency Contacts

- **On-Call Engineer**: Check PagerDuty/OpsGenie
- **DevOps Team**: devops@example.com
- **Engineering Manager**: manager@example.com
- **AWS Support**: Use AWS Support Center

### Critical Links

- **AWS Console**: https://console.aws.amazon.com/
- **CodePipeline**: https://console.aws.amazon.com/codesuite/codepipeline/pipelines
- **CloudWatch Dashboard**: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=kiro-pipeline-{env}
- **GitHub Repository**: https://github.com/your-org/kiro-codebuild-worker
- **Incident Tracking**: [Your incident tracking system]

### Common Commands

```bash
# Set environment
export ENVIRONMENT=production
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Check pipeline status
aws codepipeline get-pipeline-state --name kiro-pipeline-$ENVIRONMENT --region $AWS_REGION

# View recent logs
aws logs tail /aws/codepipeline/kiro-pipeline-$ENVIRONMENT --follow --region $AWS_REGION

# Check alarms
aws cloudwatch describe-alarms --alarm-name-prefix kiro-pipeline-$ENVIRONMENT --state-value ALARM --region $AWS_REGION
```

## Common Operational Tasks

### Task 1: Trigger Manual Deployment

**When**: Need to deploy specific commit or re-run failed deployment

**Steps**:

1. **Verify commit is in main branch**:
   ```bash
   git log --oneline -10
   ```

2. **Start pipeline execution**:
   ```bash
   aws codepipeline start-pipeline-execution \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

3. **Monitor execution**:
   ```bash
   # Get execution ID
   EXECUTION_ID=$(aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --query 'stageStates[0].latestExecution.pipelineExecutionId' \
     --output text \
     --region $AWS_REGION)
   
   # Watch execution
   watch -n 10 "aws codepipeline get-pipeline-execution \
     --pipeline-name kiro-pipeline-$ENVIRONMENT \
     --pipeline-execution-id $EXECUTION_ID \
     --region $AWS_REGION"
   ```

4. **Verify completion**:
   - Check CloudWatch dashboard
   - Verify deployment record in DynamoDB
   - Run health checks

**Expected Duration**: 30-45 minutes

**Rollback**: If deployment fails, automated rollback will trigger

### Task 2: Approve Production Deployment

**When**: Pipeline reaches production approval stage

**Steps**:

1. **Receive approval notification** via SNS email

2. **Review deployment details**:
   ```bash
   # Get approval token
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-production \
     --region $AWS_REGION \
     --query 'stageStates[?stageName==`ProductionEnv`].actionStates[?actionName==`ApproveProduction`].latestExecution.token' \
     --output text
   ```

3. **Verify staging deployment succeeded**:
   - Check CloudWatch dashboard
   - Review test results
   - Check for any alarms

4. **Approve deployment**:
   ```bash
   # Via AWS Console (recommended):
   # Navigate to CodePipeline → kiro-pipeline-production → Review button
   
   # Via CLI:
   aws codepipeline put-approval-result \
     --pipeline-name kiro-pipeline-production \
     --stage-name ProductionEnv \
     --action-name ApproveProduction \
     --result status=Approved,summary="Approved by [Your Name]" \
     --token <approval-token> \
     --region $AWS_REGION
   ```

5. **Monitor production deployment**:
   ```bash
   aws logs tail /aws/codebuild/kiro-pipeline-production-deploy-production \
     --follow \
     --region $AWS_REGION
   ```

**Expected Duration**: 15-20 minutes after approval

**Rollback**: If issues detected, automated rollback will trigger

### Task 3: Reject Production Deployment

**When**: Issues found in staging or deployment should not proceed

**Steps**:

1. **Document rejection reason**

2. **Reject deployment**:
   ```bash
   aws codepipeline put-approval-result \
     --pipeline-name kiro-pipeline-production \
     --stage-name ProductionEnv \
     --action-name ApproveProduction \
     --result status=Rejected,summary="Rejected: [Reason]" \
     --token <approval-token> \
     --region $AWS_REGION
   ```

3. **Notify team** via Slack/email

4. **Create incident ticket** if needed

5. **Fix issues** and trigger new deployment

**Expected Duration**: Immediate

### Task 4: Check Pipeline Status

**When**: Regular health check or investigating issues

**Steps**:

1. **Get pipeline state**:
   ```bash
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

2. **Check each stage status**:
   ```bash
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --query 'stageStates[*].[stageName,latestExecution.status]' \
     --output table \
     --region $AWS_REGION
   ```

3. **View CloudWatch dashboard**:
   - Navigate to CloudWatch → Dashboards → kiro-pipeline-{env}
   - Check all widgets for anomalies

4. **Check alarms**:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
     --state-value ALARM \
     --region $AWS_REGION
   ```

5. **Review recent deployments**:
   ```bash
   aws dynamodb query \
     --table-name kiro-pipeline-$ENVIRONMENT-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --expression-attribute-values '{":env":{"S":"'$ENVIRONMENT'"}}' \
     --scan-index-forward false \
     --limit 10 \
     --region $AWS_REGION
   ```

**Expected Duration**: 5-10 minutes

### Task 5: View Build Logs

**When**: Investigating build failures or debugging issues

**Steps**:

1. **Identify build project**:
   - Build stage: `kiro-pipeline-{env}-build`
   - Integration tests: `kiro-pipeline-{env}-integration-test`
   - E2E tests: `kiro-pipeline-{env}-e2e-test`
   - Deployment: `kiro-pipeline-{env}-deploy-{env}`

2. **Get recent build ID**:
   ```bash
   BUILD_ID=$(aws codebuild list-builds-for-project \
     --project-name kiro-pipeline-$ENVIRONMENT-build \
     --sort-order DESCENDING \
     --max-items 1 \
     --query 'ids[0]' \
     --output text \
     --region $AWS_REGION)
   ```

3. **View build details**:
   ```bash
   aws codebuild batch-get-builds \
     --ids $BUILD_ID \
     --region $AWS_REGION
   ```

4. **Tail build logs**:
   ```bash
   aws logs tail /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
     --follow \
     --region $AWS_REGION
   ```

5. **Search for errors**:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
     --filter-pattern "ERROR" \
     --start-time $(date -d '1 hour ago' +%s)000 \
     --region $AWS_REGION
   ```

**Expected Duration**: 5-10 minutes

### Task 6: Update Alarm Thresholds

**When**: Too many false positives or missing real issues

**Steps**:

1. **Review alarm history**:
   ```bash
   aws cloudwatch describe-alarm-history \
     --alarm-name kiro-pipeline-$ENVIRONMENT-pipeline-failures \
     --history-item-type StateUpdate \
     --max-records 20 \
     --region $AWS_REGION
   ```

2. **Analyze metric data**:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/CodePipeline \
     --metric-name PipelineExecutionFailure \
     --dimensions Name=PipelineName,Value=kiro-pipeline-$ENVIRONMENT \
     --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 3600 \
     --statistics Sum,Average,Maximum \
     --region $AWS_REGION
   ```

3. **Update alarm threshold**:
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name kiro-pipeline-$ENVIRONMENT-pipeline-failures \
     --comparison-operator GreaterThanThreshold \
     --evaluation-periods 1 \
     --metric-name PipelineExecutionFailure \
     --namespace AWS/CodePipeline \
     --period 3600 \
     --statistic Sum \
     --threshold 5 \
     --actions-enabled \
     --alarm-actions arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
     --region $AWS_REGION
   ```

4. **Update infrastructure code**:
   ```bash
   # Edit infrastructure/lib/stacks/monitoring-alerting-stack.ts
   # Update threshold value
   # Deploy changes
   cd infrastructure
   cdk deploy kiro-worker-$ENVIRONMENT-monitoring \
     --context environment=$ENVIRONMENT
   ```

5. **Document change** in runbook and notify team

**Expected Duration**: 15-20 minutes

### Task 7: Rotate Secrets

**When**: Regular security maintenance (quarterly) or after compromise

**Steps**:

1. **Generate new GitHub token**:
   - Go to https://github.com/settings/tokens
   - Generate new token with same scopes
   - Save token securely

2. **Update secret in Secrets Manager**:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id kiro-pipeline-$ENVIRONMENT-github-token \
     --secret-string "ghp_new_token_here" \
     --region $AWS_REGION
   ```

3. **Verify secret updated**:
   ```bash
   aws secretsmanager describe-secret \
     --secret-id kiro-pipeline-$ENVIRONMENT-github-token \
     --region $AWS_REGION
   ```

4. **Test pipeline with new token**:
   ```bash
   aws codepipeline start-pipeline-execution \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

5. **Revoke old GitHub token** after verification

6. **Document rotation** in security log

**Expected Duration**: 10-15 minutes

**Rollback**: If new token doesn't work, revert to old token immediately

## Incident Response Procedures

### Incident 1: Pipeline Execution Failure

**Severity**: Medium to High (depending on environment)

**Symptoms**:
- Pipeline execution fails
- Alarm: `kiro-pipeline-{env}-pipeline-failures` in ALARM state
- SNS notification received

**Response Steps**:

1. **Acknowledge incident** (< 5 minutes):
   ```bash
   # Check pipeline state
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   
   # Identify failed stage
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --query 'stageStates[?latestExecution.status==`Failed`]' \
     --region $AWS_REGION
   ```

2. **Investigate failure** (< 10 minutes):
   ```bash
   # Get build logs
   aws logs tail /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
     --since 30m \
     --region $AWS_REGION
   
   # Check for test failures
   aws logs filter-log-events \
     --log-group-name /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
     --filter-pattern "FAILED" \
     --start-time $(date -d '1 hour ago' +%s)000 \
     --region $AWS_REGION
   ```

3. **Determine root cause**:
   - Test failures → Fix tests or code
   - Security scan failures → Fix security issues
   - Infrastructure errors → Check CDK code
   - Timeout → Investigate performance

4. **Fix and redeploy** (< 30 minutes):
   ```bash
   # Create fix branch
   git checkout -b fix/pipeline-failure-$(date +%Y%m%d)
   
   # Make fixes
   # ...
   
   # Push and create PR
   git push origin fix/pipeline-failure-$(date +%Y%m%d)
   
   # After merge, pipeline will auto-trigger
   ```

5. **Verify resolution**:
   - Monitor new pipeline execution
   - Check alarms return to OK
   - Verify deployment succeeds

6. **Document incident**:
   - Create incident report
   - Update runbook if needed
   - Share lessons learned

**Expected Resolution Time**: 30-60 minutes

**Escalation**: If unable to resolve in 60 minutes, escalate to engineering manager

### Incident 2: Automated Rollback Triggered

**Severity**: High (production) to Medium (test/staging)

**Symptoms**:
- Rollback Lambda invoked
- Alarm triggered rollback
- SNS notification: "Rollback Initiated"

**Response Steps**:

1. **Acknowledge incident** (< 2 minutes):
   ```bash
   # Check rollback status
   aws logs tail /aws/lambda/kiro-pipeline-$ENVIRONMENT-rollback \
     --since 10m \
     --region $AWS_REGION
   ```

2. **Verify rollback in progress** (< 5 minutes):
   ```bash
   # Check deployment record
   aws dynamodb query \
     --table-name kiro-pipeline-$ENVIRONMENT-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --expression-attribute-values '{":env":{"S":"'$ENVIRONMENT'"}}' \
     --scan-index-forward false \
     --limit 1 \
     --region $AWS_REGION
   ```

3. **Monitor rollback completion** (< 15 minutes):
   ```bash
   # Watch rollback logs
   aws logs tail /aws/lambda/kiro-pipeline-$ENVIRONMENT-rollback \
     --follow \
     --region $AWS_REGION
   
   # Check alarms
   watch -n 30 "aws cloudwatch describe-alarms \
     --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
     --state-value ALARM \
     --region $AWS_REGION"
   ```

4. **Verify rollback success**:
   ```bash
   # Check all alarms OK
   aws cloudwatch describe-alarms \
     --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
     --state-value ALARM \
     --region $AWS_REGION
   
   # Run health checks
   curl -f https://your-app-endpoint/health
   
   # Verify deployment record
   aws dynamodb get-item \
     --table-name kiro-pipeline-$ENVIRONMENT-deployments \
     --key '{"deploymentId":{"S":"<deployment-id>"}}' \
     --region $AWS_REGION
   ```

5. **If rollback fails**:
   - Follow manual rollback procedure (see Rollback Guide)
   - Escalate to on-call engineer
   - Consider emergency rollback of all environments

6. **Investigate root cause**:
   - Review commit that triggered rollback
   - Analyze logs and metrics
   - Identify what caused alarm

7. **Create fix**:
   - Fix identified issue
   - Add tests to prevent recurrence
   - Deploy through normal pipeline

8. **Document incident**:
   - Record rollback details
   - Document root cause
   - Update monitoring if needed

**Expected Resolution Time**: 15-30 minutes (rollback) + fix time

**Escalation**: If rollback fails, escalate immediately to engineering manager and AWS support

### Incident 3: Deployment Duration Exceeds Threshold

**Severity**: Medium

**Symptoms**:
- Alarm: `kiro-pipeline-{env}-deployment-duration` in ALARM state
- Deployment taking > 60 minutes

**Response Steps**:

1. **Check deployment status** (< 5 minutes):
   ```bash
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

2. **Identify slow stage**:
   ```bash
   # Check stage durations
   aws codepipeline get-pipeline-execution \
     --pipeline-name kiro-pipeline-$ENVIRONMENT \
     --pipeline-execution-id <execution-id> \
     --region $AWS_REGION
   ```

3. **Investigate slow stage**:
   - Build stage → Check build logs for slow tests or compilation
   - Test stage → Check test execution time
   - Deploy stage → Check CDK deployment progress

4. **Determine if intervention needed**:
   - If stuck → Stop execution and restart
   - If progressing slowly → Let complete and investigate after

5. **Stop stuck execution** (if needed):
   ```bash
   aws codepipeline stop-pipeline-execution \
     --pipeline-name kiro-pipeline-$ENVIRONMENT \
     --pipeline-execution-id <execution-id> \
     --reason "Stuck execution, restarting" \
     --region $AWS_REGION
   
   # Restart
   aws codepipeline start-pipeline-execution \
     --name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

6. **Investigate performance issue**:
   - Review build logs for slow operations
   - Check for network issues
   - Review test execution times
   - Check AWS service health dashboard

7. **Optimize if needed**:
   - Parallelize tests
   - Optimize build caching
   - Increase CodeBuild compute size
   - Optimize CDK deployment

**Expected Resolution Time**: Immediate (stop/restart) or post-deployment investigation

**Escalation**: If consistently slow, escalate to DevOps team for optimization

### Incident 4: Test Coverage Below Threshold

**Severity**: Medium (blocks deployment)

**Symptoms**:
- Build fails with coverage < 80%
- Alarm: `kiro-pipeline-{env}-test-coverage` in ALARM state
- Deployment blocked

**Response Steps**:

1. **Check coverage report** (< 5 minutes):
   ```bash
   # Get build logs
   aws logs tail /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
     --since 30m \
     --region $AWS_REGION | grep -A 20 "Coverage"
   ```

2. **Identify uncovered code**:
   - Review coverage report in build artifacts
   - Identify files/functions with low coverage

3. **Add tests**:
   ```bash
   # Create branch
   git checkout -b fix/increase-coverage
   
   # Add tests for uncovered code
   # ...
   
   # Run tests locally
   npm test
   npm run test:coverage
   
   # Verify coverage ≥ 80%
   ```

4. **Push and deploy**:
   ```bash
   git push origin fix/increase-coverage
   # Create PR, get approval, merge
   ```

5. **Verify deployment succeeds**

**Expected Resolution Time**: 30-60 minutes (depending on tests needed)

**Escalation**: If unable to add tests, discuss with team lead about coverage requirements

### Incident 5: Security Scan Failures

**Severity**: High (CRITICAL/HIGH vulnerabilities block deployment)

**Symptoms**:
- Build fails with security violations
- cfn-guard or npm audit reports issues

**Response Steps**:

1. **Review security scan results** (< 5 minutes):
   ```bash
   aws logs tail /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
     --since 30m \
     --region $AWS_REGION | grep -A 50 "security"
   ```

2. **Identify violations**:
   - cfn-guard failures → Infrastructure security issues
   - npm audit failures → Dependency vulnerabilities

3. **Fix infrastructure issues**:
   ```bash
   # Review cfn-guard output
   # Fix security-rules.guard violations
   # Common fixes:
   # - Enable encryption
   # - Block public access
   # - Remove wildcard IAM permissions
   ```

4. **Fix dependency vulnerabilities**:
   ```bash
   # Update vulnerable dependencies
   npm audit fix
   
   # Or update specific packages
   npm update <package-name>
   
   # Verify fixes
   npm audit
   ```

5. **Test and deploy**:
   ```bash
   # Test locally
   npm test
   
   # Push changes
   git add package.json package-lock.json
   git commit -m "fix: update dependencies to fix security vulnerabilities"
   git push origin main
   ```

6. **Verify deployment succeeds**

**Expected Resolution Time**: 15-45 minutes (depending on fixes needed)

**Escalation**: If unable to fix CRITICAL vulnerabilities, escalate to security team

## Maintenance Procedures

### Weekly Maintenance

**Tasks**:
1. Review CloudWatch dashboard for trends
2. Check alarm history for false positives
3. Review deployment success rate
4. Check for stuck or old pipeline executions
5. Review rollback frequency

**Time Required**: 30 minutes

### Monthly Maintenance

**Tasks**:
1. Review and clean up old S3 artifacts
2. Review DynamoDB deployment history
3. Update npm dependencies
4. Review and adjust alarm thresholds
5. Review IAM permissions
6. Update documentation

**Time Required**: 2-3 hours

### Quarterly Maintenance

**Tasks**:
1. Rotate GitHub tokens and secrets
2. Review and update CDK version
3. Review AWS service limits
4. Conduct disaster recovery drill
5. Review and update runbook
6. Team training on new features

**Time Required**: 4-6 hours

## Escalation Procedures

### Level 1: On-Call Engineer

**Handles**:
- Pipeline failures
- Automated rollbacks
- Alarm investigations
- Routine operational tasks

**Escalate to Level 2 if**:
- Unable to resolve in 60 minutes
- Rollback fails
- Multiple environments affected
- Security incident

### Level 2: DevOps Team Lead

**Handles**:
- Complex infrastructure issues
- Failed rollbacks
- Performance optimization
- Security incidents

**Escalate to Level 3 if**:
- AWS service outage
- Data loss or corruption
- Critical security breach
- Unable to restore service

### Level 3: Engineering Manager + AWS Support

**Handles**:
- AWS service issues
- Critical production outages
- Major security incidents
- Architectural decisions

## Related Documentation

- [CD Pipeline Deployment Guide](../deployment/cd-pipeline-deployment.md)
- [CD Pipeline Rollback Guide](../deployment/cd-pipeline-rollback.md)
- [CD Pipeline Monitoring Guide](cd-pipeline-monitoring.md)

## Appendix

### Useful Scripts

#### Check Pipeline Health

```bash
#!/bin/bash
# check-pipeline-health.sh

ENVIRONMENT=${1:-test}
AWS_REGION=${AWS_REGION:-us-east-1}

echo "Checking pipeline health for environment: $ENVIRONMENT"

# Check pipeline state
echo "Pipeline State:"
aws codepipeline get-pipeline-state \
  --name kiro-pipeline-$ENVIRONMENT \
  --query 'stageStates[*].[stageName,latestExecution.status]' \
  --output table \
  --region $AWS_REGION

# Check alarms
echo -e "\nAlarms in ALARM state:"
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-$ENVIRONMENT \
  --state-value ALARM \
  --query 'MetricAlarms[*].[AlarmName,StateValue,StateReason]' \
  --output table \
  --region $AWS_REGION

# Check recent deployments
echo -e "\nRecent Deployments:"
aws dynamodb query \
  --table-name kiro-pipeline-$ENVIRONMENT-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'$ENVIRONMENT'"}}' \
  --scan-index-forward false \
  --limit 5 \
  --query 'Items[*].[deploymentId.S,status.S,startTime.S]' \
  --output table \
  --region $AWS_REGION
```

#### Get Deployment Summary

```bash
#!/bin/bash
# get-deployment-summary.sh

ENVIRONMENT=${1:-test}
DAYS=${2:-7}
AWS_REGION=${AWS_REGION:-us-east-1}

echo "Deployment Summary for $ENVIRONMENT (last $DAYS days)"

# Get deployment metrics
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name DeploymentSuccess \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d "$DAYS days ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum \
  --region $AWS_REGION

# Get rollback count
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name RollbackCount \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d "$DAYS days ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum \
  --region $AWS_REGION
```

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-27 | Initial runbook |
