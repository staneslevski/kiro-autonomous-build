# CD Pipeline Monitoring Guide

## Overview

This guide provides comprehensive information on monitoring the Kiro CodeBuild Worker CD Pipeline, including CloudWatch dashboards, metrics, alarms, and best practices for observability.

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Monitoring Stack                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              CloudWatch Dashboard                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │  Pipeline  │  │   Build    │  │  Rollback  │         │  │
│  │  │  Metrics   │  │  Metrics   │  │  Metrics   │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              CloudWatch Alarms                            │  │
│  │  • Pipeline Failures    • Deployment Duration             │  │
│  │  • Rollback Count       • Test Failures                   │  │
│  │  • Security Violations  • Resource Utilization            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              CloudWatch Logs                              │  │
│  │  • Pipeline Execution   • CodeBuild Logs                  │  │
│  │  • Rollback Lambda      • Deployment Records              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SNS Notifications                            │  │
│  │  • Deployment Events    • Rollback Alerts                 │  │
│  │  • Approval Requests    • Alarm Notifications             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## CloudWatch Dashboard

### Accessing the Dashboard

1. **AWS Console**:
   - Navigate to CloudWatch → Dashboards
   - Select `kiro-pipeline-{environment}` dashboard
   - URL: `https://console.aws.amazon.com/cloudwatch/home?region={region}#dashboards:name=kiro-pipeline-{env}`

2. **AWS CLI**:
   ```bash
   aws cloudwatch get-dashboard \
     --dashboard-name kiro-pipeline-$ENVIRONMENT \
     --region $AWS_REGION
   ```

### Dashboard Widgets

The dashboard includes the following widgets:

#### 1. Pipeline Execution Metrics

**Widget**: Pipeline Executions (Line Chart)
- **Metric**: `AWS/CodePipeline` → `PipelineExecutionSuccess`, `PipelineExecutionFailure`
- **Period**: 5 minutes
- **Statistic**: Sum
- **Interpretation**:
  - Green line: Successful executions
  - Red line: Failed executions
  - **Normal**: Mostly green with occasional red
  - **Alert**: Sustained red or increasing failure rate

**Widget**: Pipeline Success Rate (Number)
- **Metric**: Calculated as `(Success / (Success + Failure)) * 100`
- **Period**: 1 hour
- **Interpretation**:
  - **Healthy**: > 90%
  - **Warning**: 70-90%
  - **Critical**: < 70%

#### 2. Build Metrics

**Widget**: Build Duration (Line Chart)
- **Metric**: `AWS/CodeBuild` → `Duration`
- **Period**: 5 minutes
- **Statistic**: Average, Maximum
- **Interpretation**:
  - **Normal**: < 30 minutes average
  - **Warning**: 30-45 minutes
  - **Critical**: > 45 minutes
  - **Threshold**: 60 minutes (alarm triggers)

**Widget**: Build Success Rate (Gauge)
- **Metric**: `AWS/CodeBuild` → `SucceededBuilds` / `Builds`
- **Period**: 1 hour
- **Interpretation**:
  - **Green**: > 90%
  - **Yellow**: 70-90%
  - **Red**: < 70%

**Widget**: Test Coverage (Line Chart)
- **Metric**: `KiroPipeline` → `TestCoverage`
- **Period**: 5 minutes
- **Statistic**: Average
- **Interpretation**:
  - **Healthy**: ≥ 80%
  - **Warning**: 75-80%
  - **Critical**: < 75% (deployment blocked)

#### 3. Deployment Metrics

**Widget**: Deployment Duration by Environment (Stacked Area)
- **Metric**: `KiroPipeline` → `DeploymentDuration`
- **Dimensions**: Environment (test, staging, production)
- **Period**: 5 minutes
- **Statistic**: Average
- **Interpretation**:
  - **Test**: < 10 minutes
  - **Staging**: < 15 minutes
  - **Production**: < 20 minutes

**Widget**: Deployments by Status (Pie Chart)
- **Metric**: `KiroPipeline` → `DeploymentStatus`
- **Values**: Succeeded, Failed, Rolled Back
- **Period**: 24 hours
- **Interpretation**:
  - **Healthy**: > 95% succeeded
  - **Warning**: 85-95% succeeded
  - **Critical**: < 85% succeeded

#### 4. Rollback Metrics

**Widget**: Rollback Count (Bar Chart)
- **Metric**: `KiroPipeline` → `RollbackCount`
- **Dimensions**: Environment, Level (stage, full)
- **Period**: 1 hour
- **Statistic**: Sum
- **Interpretation**:
  - **Normal**: 0-1 per day
  - **Warning**: 2-3 per day
  - **Critical**: > 3 per day (alarm triggers)

**Widget**: Rollback Duration (Line Chart)
- **Metric**: `KiroPipeline` → `RollbackDuration`
- **Period**: 5 minutes
- **Statistic**: Average, Maximum
- **Interpretation**:
  - **Stage Rollback**: < 15 minutes
  - **Full Rollback**: < 30 minutes
  - **Threshold**: 15 minutes (alarm triggers)

#### 5. Test Results Metrics

**Widget**: Test Success Rate by Type (Stacked Bar)
- **Metric**: `KiroPipeline` → `TestSuccessRate`
- **Dimensions**: TestType (unit, integration, e2e)
- **Period**: 1 hour
- **Statistic**: Average
- **Interpretation**:
  - **Unit Tests**: Should be 100%
  - **Integration Tests**: > 95%
  - **E2E Tests**: > 90%

**Widget**: Failed Tests (Number)
- **Metric**: `KiroPipeline` → `FailedTests`
- **Period**: 1 hour
- **Statistic**: Sum
- **Interpretation**:
  - **Healthy**: 0
  - **Warning**: 1-5
  - **Critical**: > 5

#### 6. Security Metrics

**Widget**: Security Violations (Bar Chart)
- **Metric**: `KiroPipeline` → `SecurityViolations`
- **Dimensions**: Severity (CRITICAL, HIGH, MEDIUM, LOW)
- **Period**: 1 hour
- **Statistic**: Sum
- **Interpretation**:
  - **CRITICAL/HIGH**: Deployment blocked
  - **MEDIUM**: Warning, deployment allowed
  - **LOW**: Informational

### Customizing the Dashboard

Add custom widgets:

```bash
# Get current dashboard configuration
aws cloudwatch get-dashboard \
  --dashboard-name kiro-pipeline-$ENVIRONMENT \
  --region $AWS_REGION > dashboard.json

# Edit dashboard.json to add widgets

# Update dashboard
aws cloudwatch put-dashboard \
  --dashboard-name kiro-pipeline-$ENVIRONMENT \
  --dashboard-body file://dashboard.json \
  --region $AWS_REGION
```

## CloudWatch Alarms

### Configured Alarms

#### 1. Pipeline Failure Alarm

**Alarm Name**: `kiro-pipeline-{env}-pipeline-failures`

**Configuration**:
- **Metric**: `AWS/CodePipeline` → `PipelineExecutionFailure`
- **Threshold**: > 3 failures in 1 hour
- **Evaluation Periods**: 1
- **Datapoints to Alarm**: 1
- **Actions**: Send to `kiro-pipeline-{env}-deployments` SNS topic

**Interpretation**:
- **OK**: Pipeline executing successfully
- **ALARM**: Multiple pipeline failures detected
- **Response**: Investigate recent commits, check CodeBuild logs

**Tuning**:
```bash
# Adjust threshold
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

#### 2. Rollback Count Alarm

**Alarm Name**: `kiro-pipeline-{env}-rollback-count`

**Configuration**:
- **Metric**: `KiroPipeline` → `RollbackCount`
- **Threshold**: > 2 rollbacks in 1 hour
- **Evaluation Periods**: 1
- **Datapoints to Alarm**: 1
- **Actions**: Send to `kiro-pipeline-{env}-rollbacks` SNS topic

**Interpretation**:
- **OK**: Few or no rollbacks
- **ALARM**: Frequent rollbacks indicate instability
- **Response**: Review recent changes, improve testing

#### 3. Deployment Duration Alarm

**Alarm Name**: `kiro-pipeline-{env}-deployment-duration`

**Configuration**:
- **Metric**: `KiroPipeline` → `DeploymentDuration`
- **Threshold**: > 60 minutes
- **Evaluation Periods**: 1
- **Datapoints to Alarm**: 1
- **Actions**: Send to `kiro-pipeline-{env}-deployments` SNS topic

**Interpretation**:
- **OK**: Deployments completing in reasonable time
- **ALARM**: Deployment taking too long
- **Response**: Check for stuck builds, investigate performance

#### 4. Test Coverage Alarm

**Alarm Name**: `kiro-pipeline-{env}-test-coverage`

**Configuration**:
- **Metric**: `KiroPipeline` → `TestCoverage`
- **Threshold**: < 80%
- **Evaluation Periods**: 1
- **Datapoints to Alarm**: 1
- **Actions**: Block deployment, send to `kiro-pipeline-{env}-deployments` SNS topic

**Interpretation**:
- **OK**: Coverage ≥ 80%
- **ALARM**: Coverage below threshold
- **Response**: Add tests before deploying

### Alarm States

**OK**: Metric within normal range
- No action required
- Continue monitoring

**INSUFFICIENT_DATA**: Not enough data to evaluate
- Common after deployment or alarm creation
- Wait for data collection
- Check metric is being published

**ALARM**: Threshold breached
- Immediate attention required
- Follow runbook procedures
- May trigger automated rollback

### Managing Alarms

#### View Alarm History

```bash
# Get alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name kiro-pipeline-$ENVIRONMENT-pipeline-failures \
  --history-item-type StateUpdate \
  --max-records 10 \
  --region $AWS_REGION
```

#### Disable Alarm Temporarily

```bash
# Disable alarm actions (e.g., during maintenance)
aws cloudwatch disable-alarm-actions \
  --alarm-names kiro-pipeline-$ENVIRONMENT-pipeline-failures \
  --region $AWS_REGION

# Re-enable after maintenance
aws cloudwatch enable-alarm-actions \
  --alarm-names kiro-pipeline-$ENVIRONMENT-pipeline-failures \
  --region $AWS_REGION
```

#### Update Alarm Threshold

```bash
# Increase threshold for less sensitive alarming
aws cloudwatch put-metric-alarm \
  --alarm-name kiro-pipeline-$ENVIRONMENT-pipeline-failures \
  --comparison-operator GreaterThanThreshold \
  --threshold 5 \
  --region $AWS_REGION
```

## CloudWatch Logs

### Log Groups

#### 1. Pipeline Logs

**Log Group**: `/aws/codepipeline/kiro-pipeline-{env}`
- **Retention**: 90 days
- **Contents**: Pipeline execution events, stage transitions, action results
- **Use Cases**: Debugging pipeline failures, audit trail

**Viewing Logs**:
```bash
# Tail pipeline logs
aws logs tail /aws/codepipeline/kiro-pipeline-$ENVIRONMENT \
  --follow \
  --region $AWS_REGION

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/codepipeline/kiro-pipeline-$ENVIRONMENT \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region $AWS_REGION
```

#### 2. CodeBuild Logs

**Log Groups**:
- `/aws/codebuild/kiro-pipeline-{env}-build`
- `/aws/codebuild/kiro-pipeline-{env}-integration-test`
- `/aws/codebuild/kiro-pipeline-{env}-e2e-test`
- `/aws/codebuild/kiro-pipeline-{env}-deploy-test`
- `/aws/codebuild/kiro-pipeline-{env}-deploy-staging`
- `/aws/codebuild/kiro-pipeline-{env}-deploy-production`

**Retention**: 90 days
**Contents**: Build output, test results, deployment logs

**Viewing Logs**:
```bash
# Tail build logs
aws logs tail /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
  --follow \
  --region $AWS_REGION

# Get logs for specific build
BUILD_ID="<build-id>"
aws logs get-log-events \
  --log-group-name /aws/codebuild/kiro-pipeline-$ENVIRONMENT-build \
  --log-stream-name $BUILD_ID \
  --region $AWS_REGION
```

#### 3. Rollback Lambda Logs

**Log Group**: `/aws/lambda/kiro-pipeline-{env}-rollback`
- **Retention**: 90 days
- **Contents**: Rollback execution logs, validation results, errors

**Viewing Logs**:
```bash
# Tail rollback logs
aws logs tail /aws/lambda/kiro-pipeline-$ENVIRONMENT-rollback \
  --follow \
  --region $AWS_REGION

# Search for rollback events
aws logs filter-log-events \
  --log-group-name /aws/lambda/kiro-pipeline-$ENVIRONMENT-rollback \
  --filter-pattern "{ $.level = \"error\" }" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region $AWS_REGION
```

### Log Insights Queries

#### Query 1: Pipeline Execution Summary

```sql
fields @timestamp, executionId, stage, action, status
| filter @message like /execution/
| sort @timestamp desc
| limit 20
```

#### Query 2: Failed Builds

```sql
fields @timestamp, buildId, phase, status
| filter status = "FAILED"
| sort @timestamp desc
| limit 50
```

#### Query 3: Rollback Events

```sql
fields @timestamp, deploymentId, environment, level, reason
| filter @message like /rollback/
| sort @timestamp desc
| limit 20
```

#### Query 4: Test Failures

```sql
fields @timestamp, testType, testName, error
| filter status = "FAILED"
| stats count() by testType
```

#### Query 5: Deployment Duration

```sql
fields @timestamp, environment, duration
| filter @message like /deployment complete/
| stats avg(duration), max(duration), min(duration) by environment
```

### Running Log Insights Queries

```bash
# Start query
QUERY_ID=$(aws logs start-query \
  --log-group-name /aws/codepipeline/kiro-pipeline-$ENVIRONMENT \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, executionId, stage | sort @timestamp desc | limit 20' \
  --region $AWS_REGION \
  --query 'queryId' \
  --output text)

# Get query results
aws logs get-query-results \
  --query-id $QUERY_ID \
  --region $AWS_REGION
```

## Metrics

### Custom Metrics

The CD pipeline publishes custom metrics to the `KiroPipeline` namespace:

#### Deployment Metrics

**DeploymentDuration**:
- **Unit**: Seconds
- **Dimensions**: Environment
- **Description**: Time from deployment start to completion
- **Target**: < 60 minutes

**DeploymentSuccess**:
- **Unit**: Count
- **Dimensions**: Environment
- **Description**: Number of successful deployments
- **Target**: > 95% success rate

**DeploymentFailure**:
- **Unit**: Count
- **Dimensions**: Environment, Reason
- **Description**: Number of failed deployments with reason

#### Rollback Metrics

**RollbackCount**:
- **Unit**: Count
- **Dimensions**: Environment, Level (stage, full)
- **Description**: Number of rollbacks executed
- **Target**: < 2 per day

**RollbackDuration**:
- **Unit**: Seconds
- **Dimensions**: Environment, Level
- **Description**: Time to complete rollback
- **Target**: < 15 minutes

#### Test Metrics

**TestSuccessRate**:
- **Unit**: Percent
- **Dimensions**: TestType (unit, integration, e2e)
- **Description**: Percentage of tests passing
- **Target**: 100% (unit), > 95% (integration), > 90% (e2e)

**TestCoverage**:
- **Unit**: Percent
- **Dimensions**: Environment
- **Description**: Code coverage percentage
- **Target**: ≥ 80%

**FailedTests**:
- **Unit**: Count
- **Dimensions**: TestType
- **Description**: Number of failed tests

#### Security Metrics

**SecurityViolations**:
- **Unit**: Count
- **Dimensions**: Severity (CRITICAL, HIGH, MEDIUM, LOW)
- **Description**: Number of security violations found
- **Target**: 0 CRITICAL/HIGH

### Querying Metrics

```bash
# Get deployment duration
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name DeploymentDuration \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum,Minimum \
  --region $AWS_REGION

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

# Get test coverage
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name TestCoverage \
  --dimensions Name=Environment,Value=$ENVIRONMENT \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average \
  --region $AWS_REGION
```

## SNS Notifications

### Notification Topics

#### 1. Deployment Notifications

**Topic**: `kiro-pipeline-{env}-deployments`
- **Purpose**: Deployment start, success, failure events
- **Subscribers**: Development team, DevOps team
- **Message Format**: JSON with deployment details

**Example Message**:
```json
{
  "eventType": "deployment_success",
  "timestamp": "2026-01-27T10:30:00Z",
  "environment": "production",
  "version": "abc123def",
  "executionId": "exec-456",
  "duration": 1800,
  "testResults": {
    "unit": {"passed": 150, "failed": 0},
    "integration": {"passed": 45, "failed": 0},
    "e2e": {"passed": 20, "failed": 0}
  }
}
```

#### 2. Approval Requests

**Topic**: `kiro-pipeline-{env}-approvals`
- **Purpose**: Production deployment approval requests
- **Subscribers**: Engineering managers, product owners
- **Message Format**: JSON with approval details and link

**Example Message**:
```json
{
  "eventType": "approval_required",
  "timestamp": "2026-01-27T10:30:00Z",
  "environment": "production",
  "version": "abc123def",
  "approvalUrl": "https://console.aws.amazon.com/codesuite/codepipeline/...",
  "timeout": "24 hours",
  "changes": "Feature X implementation, Bug fixes"
}
```

#### 3. Rollback Alerts

**Topic**: `kiro-pipeline-{env}-rollbacks`
- **Purpose**: Rollback initiated, success, failure events
- **Subscribers**: On-call engineers, DevOps team, management
- **Message Format**: JSON with rollback details

**Example Message**:
```json
{
  "eventType": "rollback_initiated",
  "timestamp": "2026-01-27T10:30:00Z",
  "environment": "production",
  "level": "stage",
  "reason": "Alarm: kiro-pipeline-production-build-failures",
  "targetVersion": "xyz789abc",
  "currentVersion": "abc123def"
}
```

### Managing Subscriptions

```bash
# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
  --region $AWS_REGION

# Add email subscription
aws sns subscribe \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
  --protocol email \
  --notification-endpoint new-email@example.com \
  --region $AWS_REGION

# Remove subscription
aws sns unsubscribe \
  --subscription-arn <subscription-arn> \
  --region $AWS_REGION
```

## Monitoring Best Practices

### 1. Regular Review

- **Daily**: Check dashboard for anomalies
- **Weekly**: Review alarm history and trends
- **Monthly**: Analyze metrics and adjust thresholds

### 2. Proactive Monitoring

- Set up alerts for degrading trends
- Monitor leading indicators (build duration increasing)
- Review logs for warnings before they become errors

### 3. Alarm Tuning

- Adjust thresholds based on actual behavior
- Reduce false positives
- Ensure critical issues trigger alarms

### 4. Documentation

- Document alarm responses in runbook
- Keep dashboard up to date
- Share monitoring insights with team

### 5. Continuous Improvement

- Add new metrics as needed
- Create custom dashboards for specific use cases
- Automate common monitoring tasks

## Troubleshooting Monitoring Issues

### Issue: Metrics Not Appearing

**Cause**: Metrics not being published or delayed

**Solution**:
```bash
# Check if metrics are being published
aws cloudwatch list-metrics \
  --namespace KiroPipeline \
  --region $AWS_REGION

# Check metric publication code
# Verify PipelineMetrics component is being called
```

### Issue: Alarms Not Triggering

**Cause**: Incorrect threshold or insufficient data

**Solution**:
```bash
# Check alarm configuration
aws cloudwatch describe-alarms \
  --alarm-names kiro-pipeline-$ENVIRONMENT-pipeline-failures \
  --region $AWS_REGION

# Check metric data
aws cloudwatch get-metric-statistics \
  --namespace AWS/CodePipeline \
  --metric-name PipelineExecutionFailure \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region $AWS_REGION
```

### Issue: SNS Notifications Not Received

**Cause**: Subscription not confirmed or email filtering

**Solution**:
```bash
# Check subscription status
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
  --region $AWS_REGION

# Resend confirmation
aws sns subscribe \
  --topic-arn arn:aws:sns:$AWS_REGION:$AWS_ACCOUNT_ID:kiro-pipeline-$ENVIRONMENT-deployments \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region $AWS_REGION
```

## Related Documentation

- [CD Pipeline Deployment Guide](../deployment/cd-pipeline-deployment.md)
- [CD Pipeline Rollback Guide](../deployment/cd-pipeline-rollback.md)
- [CD Pipeline Runbook](cd-pipeline-runbook.md)
- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)

## Appendix

### Metric Reference

| Metric Name | Namespace | Unit | Dimensions | Description |
|-------------|-----------|------|------------|-------------|
| PipelineExecutionSuccess | AWS/CodePipeline | Count | PipelineName | Successful pipeline executions |
| PipelineExecutionFailure | AWS/CodePipeline | Count | PipelineName | Failed pipeline executions |
| Duration | AWS/CodeBuild | Seconds | ProjectName | Build duration |
| SucceededBuilds | AWS/CodeBuild | Count | ProjectName | Successful builds |
| FailedBuilds | AWS/CodeBuild | Count | ProjectName | Failed builds |
| DeploymentDuration | KiroPipeline | Seconds | Environment | Deployment duration |
| RollbackCount | KiroPipeline | Count | Environment, Level | Rollback count |
| TestCoverage | KiroPipeline | Percent | Environment | Test coverage percentage |
| SecurityViolations | KiroPipeline | Count | Severity | Security violations found |

### Dashboard JSON Template

See `infrastructure/lib/stacks/monitoring-alerting-stack.ts` for the complete dashboard configuration.

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-27 | Initial monitoring guide |
