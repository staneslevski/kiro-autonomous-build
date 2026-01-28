# CD Pipeline Monitoring Guide

## Overview

This document provides comprehensive guidance on monitoring the Kiro CodeBuild Worker CD Pipeline. It covers CloudWatch dashboards, metrics, alarms, and how to interpret monitoring data to ensure healthy pipeline operations.

## Table of Contents

1. [CloudWatch Dashboard](#cloudwatch-dashboard)
2. [Metrics and Interpretation](#metrics-and-interpretation)
3. [Alarms Configuration](#alarms-configuration)
4. [Log Analysis](#log-analysis)
5. [Performance Monitoring](#performance-monitoring)
6. [Troubleshooting Monitoring Issues](#troubleshooting-monitoring-issues)

## CloudWatch Dashboard

### Accessing the Dashboard

The CD Pipeline CloudWatch dashboard provides real-time visibility into pipeline health and performance.

**Dashboard Location**:
- **Test Environment**: `kiro-pipeline-test-dashboard`
- **Staging Environment**: `kiro-pipeline-staging-dashboard`
- **Production Environment**: `kiro-pipeline-production-dashboard`

**Access via AWS Console**:
```
1. Navigate to CloudWatch Console
2. Select "Dashboards" from left menu
3. Click on "kiro-pipeline-{environment}-dashboard"
```

**Access via AWS CLI**:
```bash
# View dashboard
aws cloudwatch get-dashboard \
  --dashboard-name kiro-pipeline-production-dashboard \
  --region us-east-1

# List all pipeline dashboards
aws cloudwatch list-dashboards \
  --region us-east-1 | grep kiro-pipeline
```

### Dashboard Widgets

The dashboard contains the following widgets organized by category:

#### 1. Pipeline Execution Metrics

**Widget: Pipeline Executions**
- **Metrics Displayed**:
  - Successful executions (green line)
  - Failed executions (red line)
- **Time Period**: 1 hour aggregation
- **Interpretation**:
  - **Normal**: Steady successful executions, minimal failures
  - **Warning**: Occasional failures (< 10% failure rate)
  - **Critical**: High failure rate (> 25%) or no successful executions

**Widget: Pipeline Success Rate**
- **Metric**: Percentage of successful pipeline executions
- **Time Period**: Rolling 24-hour window
- **Interpretation**:
  - **Healthy**: ≥ 95% success rate
  - **Degraded**: 85-95% success rate
  - **Unhealthy**: < 85% success rate

#### 2. Deployment Duration Metrics

**Widget: Deployment Duration**
- **Metrics Displayed**:
  - Average deployment duration (blue line)
  - P50, P90, P99 percentiles (dotted lines)
- **Time Period**: 1 hour aggregation
- **Interpretation**:
  - **Normal**: < 60 minutes average
  - **Slow**: 60-90 minutes average
  - **Critical**: > 90 minutes average
- **Action Required**:
  - If consistently > 60 minutes, investigate build caching, test optimization, or infrastructure sizing

**Widget: Stage Duration Breakdown**
- **Metrics Displayed**:
  - Source stage duration
  - Build stage duration
  - Test environment stage duration
  - Staging environment stage duration
  - Production stage duration
- **Interpretation**:
  - Identify which stage is causing delays
  - **Build Stage**: Should be < 10 minutes
  - **Test Environment**: Should be < 15 minutes
  - **Staging Environment**: Should be < 20 minutes
  - **Production**: Should be < 15 minutes

#### 3. Rollback Metrics

**Widget: Rollback Count**
- **Metrics Displayed**:
  - Stage-level rollbacks (yellow bars)
  - Full rollbacks (red bars)
- **Time Period**: 1 hour aggregation
- **Interpretation**:
  - **Normal**: 0-1 rollbacks per day
  - **Warning**: 2-3 rollbacks per day
  - **Critical**: > 3 rollbacks per day
- **Action Required**:
  - Investigate root cause of frequent rollbacks
  - Review test quality and coverage
  - Check for infrastructure instability

**Widget: Rollback Success Rate**
- **Metric**: Percentage of successful rollback operations
- **Time Period**: Rolling 7-day window
- **Interpretation**:
  - **Healthy**: 100% success rate
  - **Warning**: 95-99% success rate
  - **Critical**: < 95% success rate (requires immediate attention)

#### 4. Test Results Metrics

**Widget: Test Success Rate**
- **Metrics Displayed**:
  - Unit test success rate
  - Integration test success rate
  - E2E test success rate
- **Time Period**: Per deployment
- **Interpretation**:
  - **Healthy**: 100% success rate for all test types
  - **Warning**: 95-99% success rate
  - **Critical**: < 95% success rate

**Widget: Code Coverage**
- **Metric**: Code coverage percentage
- **Time Period**: Per deployment
- **Interpretation**:
  - **Passing**: ≥ 80% coverage (deployment allowed)
  - **Failing**: < 80% coverage (deployment blocked)
- **Threshold**: 80% minimum (enforced by pipeline)

#### 5. Security Scan Metrics

**Widget: Security Vulnerabilities**
- **Metrics Displayed**:
  - CRITICAL severity count (red)
  - HIGH severity count (orange)
  - MEDIUM severity count (yellow)
  - LOW severity count (green)
- **Interpretation**:
  - **Blocking**: Any CRITICAL or HIGH severity issues block deployment
  - **Warning**: MEDIUM severity issues generate warnings
  - **Informational**: LOW severity issues logged only

#### 6. Health Check Metrics

**Widget: Post-Deployment Health Checks**
- **Metrics Displayed**:
  - Health check success rate per environment
  - Failed alarm count during health checks
- **Time Period**: Per deployment
- **Interpretation**:
  - **Healthy**: 100% health check success
  - **Degraded**: Health checks pass but with warnings
  - **Failed**: Health checks fail, triggering rollback

## Metrics and Interpretation

### Custom Metrics Namespace

All CD Pipeline custom metrics are published to the `KiroPipeline` namespace.

**Available Metrics**:

| Metric Name | Unit | Dimensions | Description |
|-------------|------|------------|-------------|
| `DeploymentDuration` | Seconds | Environment | Total time from pipeline start to completion |
| `RollbackCount` | Count | Environment, Level | Number of rollbacks (stage or full) |
| `TestSuccessRate` | Percent | TestType | Percentage of passing tests |
| `CoveragePercentage` | Percent | - | Code coverage percentage |
| `SecurityViolations` | Count | Severity | Number of security issues by severity |
| `HealthCheckFailures` | Count | Environment | Number of failed health checks |

### Querying Metrics

**Using AWS CLI**:

```bash
# Get deployment duration for production
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name DeploymentDuration \
  --dimensions Name=Environment,Value=production \
  --start-time 2026-01-27T00:00:00Z \
  --end-time 2026-01-27T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum,Minimum \
  --region us-east-1

# Get rollback count
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name RollbackCount \
  --dimensions Name=Environment,Value=production \
  --start-time 2026-01-27T00:00:00Z \
  --end-time 2026-01-27T23:59:59Z \
  --period 3600 \
  --statistics Sum \
  --region us-east-1
```

**Using CloudWatch Insights**:

```sql
-- Query deployment durations over time
SELECT 
  AVG(DeploymentDuration) as avg_duration,
  MAX(DeploymentDuration) as max_duration,
  MIN(DeploymentDuration) as min_duration
FROM SCHEMA("KiroPipeline", DeploymentDuration)
WHERE Environment = 'production'
GROUP BY bin(5m)

-- Query rollback frequency
SELECT 
  COUNT(*) as rollback_count,
  Level
FROM SCHEMA("KiroPipeline", RollbackCount)
WHERE Environment = 'production'
GROUP BY Level
```

### Metric Interpretation Guidelines

#### Deployment Duration

**Baseline Performance**:
- **Test Environment**: 15-20 minutes
- **Staging Environment**: 20-25 minutes
- **Production Environment**: 25-30 minutes
- **Total Pipeline**: 50-60 minutes

**Performance Degradation Indicators**:
- **Gradual Increase**: May indicate growing test suite, increasing dependencies, or infrastructure degradation
- **Sudden Spike**: May indicate infrastructure issues, network problems, or test failures
- **Consistent Slowness**: May indicate need for optimization (caching, parallelization, resource sizing)

**Action Items**:
1. Review build logs for slow stages
2. Check CodeBuild compute size (consider upgrading from SMALL to MEDIUM)
3. Verify caching is working (node_modules, Docker layers)
4. Optimize test execution (parallel test runs)
5. Review dependency installation time

#### Rollback Frequency

**Acceptable Rollback Rate**:
- **Normal**: 0-2 rollbacks per week
- **Elevated**: 3-5 rollbacks per week
- **Critical**: > 5 rollbacks per week

**Common Rollback Causes**:
1. **Test Failures**: Indicates insufficient pre-commit testing or flaky tests
2. **Alarm Triggers**: Indicates application issues or overly sensitive alarms
3. **Deployment Failures**: Indicates infrastructure issues or configuration problems
4. **Health Check Failures**: Indicates application startup issues or dependency problems

**Action Items**:
1. Review rollback logs in CloudWatch
2. Identify patterns in rollback causes
3. Improve test coverage and quality
4. Tune alarm thresholds if false positives
5. Fix underlying application issues

#### Test Success Rate

**Target Success Rate**: 100%

**Degraded Success Rate Causes**:
- **Flaky Tests**: Tests that pass/fail intermittently
- **Environment Issues**: Test environment instability
- **Timing Issues**: Race conditions or timeout problems
- **Dependency Issues**: External service unavailability

**Action Items**:
1. Identify flaky tests and fix or quarantine
2. Increase test timeouts if timing-related
3. Mock external dependencies
4. Improve test isolation

## Alarms Configuration

### Pipeline Alarms

The CD Pipeline has the following CloudWatch alarms configured:

#### 1. Pipeline Failure Alarm

**Alarm Name**: `kiro-pipeline-{environment}-failures`

**Configuration**:
- **Metric**: Pipeline failed executions
- **Threshold**: 3 failures in 1 hour
- **Evaluation Period**: 1 period
- **Statistic**: Sum
- **Comparison**: Greater than threshold
- **Actions**: Send notification to SNS topic

**Interpretation**:
- **OK**: Fewer than 3 failures in the last hour
- **ALARM**: 3 or more failures in the last hour

**Response Actions**:
1. Check CloudWatch logs for error messages
2. Review recent commits for breaking changes
3. Verify infrastructure health
4. Check for external dependency issues
5. Review test failures in CodeBuild console

**Tuning Guidance**:
- **Too Sensitive**: Increase threshold to 5 failures
- **Not Sensitive Enough**: Decrease threshold to 2 failures or reduce time window to 30 minutes

#### 2. Rollback Alarm

**Alarm Name**: `kiro-pipeline-{environment}-rollbacks`

**Configuration**:
- **Metric**: Rollback count
- **Threshold**: 2 rollbacks in 1 hour
- **Evaluation Period**: 1 period
- **Statistic**: Sum
- **Comparison**: Greater than threshold
- **Actions**: Send notification to SNS topic

**Interpretation**:
- **OK**: Fewer than 2 rollbacks in the last hour
- **ALARM**: 2 or more rollbacks in the last hour

**Response Actions**:
1. Review rollback reasons in DynamoDB deployments table
2. Check for recurring issues
3. Investigate application stability
4. Review alarm configurations for false positives
5. Check for infrastructure problems

**Tuning Guidance**:
- **Too Sensitive**: Increase threshold to 3 rollbacks
- **Not Sensitive Enough**: Decrease threshold to 1 rollback

#### 3. Deployment Duration Alarm

**Alarm Name**: `kiro-pipeline-{environment}-duration`

**Configuration**:
- **Metric**: Deployment duration
- **Threshold**: 60 minutes
- **Evaluation Period**: 1 period
- **Statistic**: Average
- **Comparison**: Greater than threshold
- **Actions**: Send notification to SNS topic

**Interpretation**:
- **OK**: Average deployment duration < 60 minutes
- **ALARM**: Average deployment duration > 60 minutes

**Response Actions**:
1. Identify slow pipeline stages
2. Review build logs for bottlenecks
3. Check CodeBuild resource utilization
4. Verify caching is working
5. Consider infrastructure upgrades

**Tuning Guidance**:
- **Too Sensitive**: Increase threshold to 75 minutes
- **Not Sensitive Enough**: Decrease threshold to 45 minutes

### Alarm Actions

All alarms are configured to send notifications to SNS topics:

**SNS Topics**:
- **Deployment Notifications**: `kiro-pipeline-{environment}-deployments`
- **Approval Requests**: `kiro-pipeline-{environment}-approvals`
- **Rollback Notifications**: `kiro-pipeline-{environment}-rollbacks`

**Notification Channels**:
- Email subscriptions (configured per environment)
- Slack integration (via Lambda function)
- PagerDuty integration (production only)

### Managing Alarm Subscriptions

**Add Email Subscription**:
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-production-deployments \
  --protocol email \
  --notification-endpoint devops-team@example.com \
  --region us-east-1
```

**Remove Subscription**:
```bash
# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-production-deployments \
  --region us-east-1

# Unsubscribe
aws sns unsubscribe \
  --subscription-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-production-deployments:abc123 \
  --region us-east-1
```

### Alarm Tuning Best Practices

1. **Start Conservative**: Begin with higher thresholds and tighten as you understand normal behavior
2. **Monitor False Positives**: Track alarm frequency and adjust if too many false alarms
3. **Environment-Specific Tuning**: Production may need tighter thresholds than test/staging
4. **Seasonal Adjustments**: Consider deployment patterns (e.g., fewer deployments on weekends)
5. **Document Changes**: Record threshold changes and rationale in runbook

## Log Analysis

### Log Groups

The CD Pipeline writes logs to the following CloudWatch log groups:

| Log Group | Purpose | Retention |
|-----------|---------|-----------|
| `/aws/codepipeline/kiro-pipeline-{env}` | Pipeline execution logs | 90 days |
| `/aws/codebuild/kiro-pipeline-{env}-build` | Build stage logs | 90 days |
| `/aws/codebuild/kiro-pipeline-{env}-integration-test` | Integration test logs | 90 days |
| `/aws/codebuild/kiro-pipeline-{env}-e2e-test` | E2E test logs | 90 days |
| `/aws/codebuild/kiro-pipeline-{env}-deploy-test` | Test deployment logs | 90 days |
| `/aws/codebuild/kiro-pipeline-{env}-deploy-staging` | Staging deployment logs | 90 days |
| `/aws/codebuild/kiro-pipeline-{env}-deploy-production` | Production deployment logs | 90 days |
| `/aws/lambda/kiro-pipeline-{env}-rollback` | Rollback Lambda logs | 90 days |

### Searching Logs

**Using CloudWatch Logs Insights**:

```sql
-- Find all pipeline failures in last 24 hours
fields @timestamp, @message
| filter @message like /ERROR/ or @message like /FAILED/
| sort @timestamp desc
| limit 100

-- Find deployment durations
fields @timestamp, deploymentId, duration
| filter @message like /Deployment completed/
| parse @message "duration: * seconds" as duration
| stats avg(duration), max(duration), min(duration) by bin(1h)

-- Find rollback events
fields @timestamp, environment, reason
| filter @message like /Rollback initiated/
| parse @message "environment: *, reason: *" as environment, reason
| sort @timestamp desc

-- Find test failures
fields @timestamp, testName, error
| filter @message like /Test failed/
| parse @message "test: *, error: *" as testName, error
| stats count() by testName
| sort count desc
```

**Using AWS CLI**:

```bash
# Tail pipeline logs
aws logs tail /aws/codepipeline/kiro-pipeline-production \
  --follow \
  --region us-east-1

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/codepipeline/kiro-pipeline-production \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --region us-east-1

# Get specific log stream
aws logs get-log-events \
  --log-group-name /aws/codepipeline/kiro-pipeline-production \
  --log-stream-name 2026/01/27/execution-abc123 \
  --region us-east-1
```

### Log Analysis Patterns

#### Identifying Deployment Issues

**Pattern**: Deployment failures
```sql
fields @timestamp, stage, error
| filter @message like /Stage failed/
| parse @message "stage: *, error: *" as stage, error
| stats count() by stage, error
```

**Common Errors**:
- `CDK deployment failed`: Infrastructure deployment issue
- `Test execution failed`: Test failures blocking deployment
- `Health check failed`: Application not healthy after deployment
- `Timeout exceeded`: Stage took too long to complete

#### Identifying Rollback Issues

**Pattern**: Rollback failures
```sql
fields @timestamp, deploymentId, reason, level
| filter @message like /Rollback failed/
| parse @message "deployment: *, reason: *, level: *" as deploymentId, reason, level
| sort @timestamp desc
```

**Common Errors**:
- `Previous version not found`: Rollback target missing
- `CDK rollback failed`: Infrastructure rollback issue
- `Validation failed`: Rollback completed but validation failed

## Performance Monitoring

### Key Performance Indicators (KPIs)

Track these KPIs to ensure pipeline health:

| KPI | Target | Warning | Critical |
|-----|--------|---------|----------|
| Pipeline Success Rate | ≥ 95% | 85-95% | < 85% |
| Average Deployment Duration | < 60 min | 60-90 min | > 90 min |
| Rollback Frequency | < 2/week | 2-5/week | > 5/week |
| Rollback Success Rate | 100% | 95-99% | < 95% |
| Test Success Rate | 100% | 95-99% | < 95% |
| Code Coverage | ≥ 80% | 75-80% | < 75% |
| Mean Time to Recovery (MTTR) | < 15 min | 15-30 min | > 30 min |

### Performance Trends

**Weekly Performance Report**:

```bash
# Generate weekly report
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name DeploymentDuration \
  --dimensions Name=Environment,Value=production \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Average,Maximum,Minimum \
  --region us-east-1
```

**Monthly Trend Analysis**:
1. Compare current month metrics to previous month
2. Identify trends (improving, degrading, stable)
3. Correlate with code changes and infrastructure updates
4. Adjust thresholds and optimization priorities

## Troubleshooting Monitoring Issues

### Dashboard Not Loading

**Symptoms**: Dashboard shows "No data" or fails to load

**Possible Causes**:
1. Metrics not being published
2. IAM permissions issue
3. Dashboard configuration error
4. Region mismatch

**Resolution Steps**:
```bash
# Verify metrics exist
aws cloudwatch list-metrics \
  --namespace KiroPipeline \
  --region us-east-1

# Check dashboard configuration
aws cloudwatch get-dashboard \
  --dashboard-name kiro-pipeline-production-dashboard \
  --region us-east-1

# Verify IAM permissions
aws iam get-role-policy \
  --role-name KiroPipelineRole \
  --policy-name MetricsPolicy \
  --region us-east-1
```

### Metrics Not Appearing

**Symptoms**: Expected metrics not showing in dashboard or queries

**Possible Causes**:
1. Metric publishing code not executing
2. IAM permissions missing
3. Incorrect namespace or dimensions
4. CloudWatch API throttling

**Resolution Steps**:
```bash
# Check CodeBuild logs for metric publishing
aws logs filter-log-events \
  --log-group-name /aws/codebuild/kiro-pipeline-production-build \
  --filter-pattern "PutMetricData" \
  --region us-east-1

# Verify IAM permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/KiroPipelineRole \
  --action-names cloudwatch:PutMetricData \
  --region us-east-1

# Check for throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudWatch \
  --metric-name ThrottledRequests \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

### Alarms Not Triggering

**Symptoms**: Alarms remain in OK state despite threshold breaches

**Possible Causes**:
1. Alarm configuration error
2. Insufficient data points
3. Incorrect metric or dimensions
4. SNS topic permissions issue

**Resolution Steps**:
```bash
# Check alarm configuration
aws cloudwatch describe-alarms \
  --alarm-names kiro-pipeline-production-failures \
  --region us-east-1

# Check alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name kiro-pipeline-production-failures \
  --history-item-type StateUpdate \
  --start-date $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1

# Verify SNS topic permissions
aws sns get-topic-attributes \
  --topic-arn arn:aws:sns:us-east-1:123456789012:kiro-pipeline-production-deployments \
  --region us-east-1

# Test alarm manually
aws cloudwatch set-alarm-state \
  --alarm-name kiro-pipeline-production-failures \
  --state-value ALARM \
  --state-reason "Manual test" \
  --region us-east-1
```

### Log Retention Issues

**Symptoms**: Logs disappearing before expected retention period

**Possible Causes**:
1. Retention policy misconfigured
2. Log group deleted and recreated
3. Logs manually deleted

**Resolution Steps**:
```bash
# Check retention settings
aws logs describe-log-groups \
  --log-group-name-prefix /aws/codepipeline/kiro-pipeline \
  --region us-east-1

# Update retention if needed
aws logs put-retention-policy \
  --log-group-name /aws/codepipeline/kiro-pipeline-production \
  --retention-in-days 90 \
  --region us-east-1
```

## Best Practices

1. **Regular Review**: Review dashboard daily for production, weekly for test/staging
2. **Trend Analysis**: Track metrics over time to identify degradation early
3. **Alarm Tuning**: Continuously tune alarms to reduce false positives while maintaining sensitivity
4. **Log Retention**: Ensure logs retained long enough for incident investigation (90 days minimum)
5. **Documentation**: Document baseline performance and threshold rationale
6. **Automation**: Automate metric collection and reporting where possible
7. **Correlation**: Correlate pipeline metrics with application metrics for holistic view
8. **Capacity Planning**: Use metrics to inform infrastructure sizing decisions
9. **Incident Response**: Use monitoring data to drive incident response and post-mortems
10. **Continuous Improvement**: Use metrics to identify optimization opportunities

## Related Documentation

- [CD Pipeline Runbook](./cd-pipeline-runbook.md) - Operational procedures and incident response
- [CD Pipeline Deployment Guide](../deployment/cd-pipeline-deployment.md) - Deployment procedures
- [CD Pipeline Rollback Guide](../deployment/cd-pipeline-rollback.md) - Rollback procedures
- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/) - Official AWS documentation
