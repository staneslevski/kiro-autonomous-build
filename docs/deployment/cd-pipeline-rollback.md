# CD Pipeline Rollback Documentation

## Table of Contents

1. [Overview](#overview)
2. [Automated Rollback System](#automated-rollback-system)
3. [Manual Rollback Procedures](#manual-rollback-procedures)
4. [Rollback Validation](#rollback-validation)
5. [Troubleshooting](#troubleshooting)
6. [Example Commands](#example-commands)
7. [Recovery Procedures](#recovery-procedures)

## Overview

The Kiro CodeBuild Worker CD Pipeline includes a comprehensive automated rollback system designed to maintain service availability and quickly recover from failed deployments. This document describes both automated and manual rollback procedures.

### Rollback Objectives

- **Fast Recovery**: Complete rollback in < 15 minutes
- **Zero Data Loss**: Preserve all deployment history and state
- **Idempotent Operations**: Safe to execute multiple times
- **Comprehensive Validation**: Verify rollback success before completion
- **Clear Communication**: Notify stakeholders of all rollback events

### Rollback Levels

The system supports two levels of rollback:

1. **Stage-Level Rollback**: Reverts only the current environment to its previous version
   - Fastest recovery option
   - Minimal impact on other environments
   - Used for single-environment failures

2. **Full Rollback**: Reverts all environments to the last known good version
   - Complete recovery across all environments
   - Used when stage-level rollback fails
   - Ensures consistency across test, staging, and production

## Automated Rollback System

### Rollback Triggers

The automated rollback system monitors deployments and triggers rollback when:

1. **Test Failures**
   - Unit tests fail (coverage < 80%)
   - Integration tests fail in test environment
   - End-to-end tests fail in staging environment

2. **Security Scan Failures**
   - CRITICAL severity vulnerabilities detected
   - HIGH severity vulnerabilities detected
   - cfn-guard policy violations
   - cfn-lint errors in infrastructure templates

3. **Deployment Failures**
   - CDK deployment fails
   - CodeBuild project execution fails
   - Artifact upload/download failures
   - Timeout during deployment

4. **CloudWatch Alarm State Changes**
   - Any alarm with prefix `kiro-pipeline-{environment}` enters ALARM state
   - Detected via EventBridge rule
   - Triggers rollback Lambda function

5. **Health Check Failures**
   - Post-deployment health checks fail
   - Alarms remain in ALARM state after deployment
   - Application health endpoints unreachable

### Automated Rollback Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Deployment Failure Detected                   │
│         (Test Failure / Alarm / Security Scan / Timeout)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Record Rollback Initiation in DynamoDB              │
│                  Send Rollback Start Notification                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Attempt Stage-Level Rollback                    │
│  1. Retrieve previous deployment version from DynamoDB          │
│  2. Revert infrastructure (if changed) using CDK                │
│  3. Revert application code to previous version                 │
│  4. Run health checks and validate alarms                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  Stage Rollback  │  │  Stage Rollback  │
         │    Succeeds      │  │     Fails        │
         └────────┬─────────┘  └────────┬─────────┘
                  │                     │
                  │                     ▼
                  │          ┌──────────────────────┐
                  │          │ Attempt Full Rollback│
                  │          │ (All Environments)   │
                  │          └────────┬─────────────┘
                  │                   │
                  │          ┌────────┴────────┐
                  │          │                 │
                  │          ▼                 ▼
                  │   ┌─────────────┐  ┌─────────────┐
                  │   │Full Rollback│  │Full Rollback│
                  │   │  Succeeds   │  │   Fails     │
                  │   └──────┬──────┘  └──────┬──────┘
                  │          │                 │
                  ▼          ▼                 ▼
         ┌────────────────────────────────────────────┐
         │      Record Rollback Result in DynamoDB    │
         │      Send Rollback Notification (SNS)      │
         └────────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
         ┌──────────────────┐  ┌──────────────────────┐
         │  Rollback        │  │  Rollback Failed     │
         │  Successful      │  │  Escalate to Manual  │
         │  Resume Normal   │  │  Intervention        │
         │  Operations      │  │  Create Incident     │
         └──────────────────┘  └──────────────────────┘
```

### EventBridge-Triggered Rollback

The rollback Lambda function is automatically invoked when CloudWatch alarms enter ALARM state:

**EventBridge Rule Configuration:**
```json
{
  "source": ["aws.cloudwatch"],
  "detail-type": ["CloudWatch Alarm State Change"],
  "detail": {
    "alarmName": [{"prefix": "kiro-pipeline-"}],
    "state": {
      "value": ["ALARM"]
    }
  }
}
```

**Rollback Lambda Processing:**
1. Parse alarm event from EventBridge
2. Check if alarm is deployment-related (matches environment prefix)
3. Query DynamoDB for current active deployment
4. If deployment found, trigger RollbackOrchestrator
5. If no deployment found, log warning and exit
6. Handle errors and send to Dead Letter Queue

**Monitored Alarms:**
- `kiro-pipeline-{env}-failures`: Pipeline execution failures
- `kiro-pipeline-{env}-rollbacks`: Excessive rollback count
- `kiro-pipeline-{env}-duration`: Deployment duration exceeds threshold
- `kiro-worker-{env}-*`: Application-specific alarms (error rate, latency, etc.)

### Rollback Validation

After executing rollback, the system performs comprehensive validation:

**Validation Steps:**
1. **Stabilization Wait**: 1-minute wait for deployment to stabilize
2. **Alarm State Check**: Verify all alarms are in OK state
3. **Health Check Execution**: Run application health checks
4. **Version Verification**: Confirm deployed version matches target version
5. **Deployment Record Update**: Update DynamoDB with rollback result

**Validation Success Criteria:**
- All CloudWatch alarms in OK or INSUFFICIENT_DATA state
- Application health endpoints return 200 OK
- Deployed version matches previous known good version
- No errors in CloudWatch logs for 1 minute

**Validation Failure Handling:**
- Log validation failure details
- Send notification to SNS topic
- If stage rollback validation fails, trigger full rollback
- If full rollback validation fails, escalate to manual intervention

## Manual Rollback Procedures

### When to Use Manual Rollback

Manual rollback should be used when:

1. **Automated Rollback Fails**: Both stage-level and full rollback attempts fail
2. **Partial Deployment Issues**: Only specific components need rollback
3. **Data Consistency Issues**: Automated rollback might cause data loss
4. **Complex Failure Scenarios**: Multiple interrelated failures require careful coordination
5. **Testing Rollback Procedures**: Validating rollback process in non-production

### Prerequisites for Manual Rollback

Before initiating manual rollback, ensure you have:

- [ ] AWS CLI configured with appropriate credentials
- [ ] Access to AWS Console with CodePipeline, CodeBuild, and DynamoDB permissions
- [ ] Current deployment ID and version (from DynamoDB or CloudWatch logs)
- [ ] Previous known good version (commit SHA)
- [ ] Approval from incident commander or on-call engineer
- [ ] Communication channel open with stakeholders

### Manual Rollback Steps

#### Step 1: Identify Current Deployment State

```bash
# Set environment variable
export ENVIRONMENT=production  # or test, staging

# Get current deployment from DynamoDB
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"}}' \
  --scan-index-forward false \
  --limit 1

# Get current pipeline execution
aws codepipeline get-pipeline-state \
  --name kiro-pipeline-${ENVIRONMENT}

# Check current application version
aws s3 ls s3://kiro-worker-${ENVIRONMENT}-artifacts/ --recursive | sort | tail -n 10
```

#### Step 2: Identify Target Rollback Version

```bash
# Get last known good deployment from DynamoDB
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env AND #status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"},":status":{"S":"succeeded"}}' \
  --scan-index-forward false \
  --limit 1

# Extract version (commit SHA) from output
export TARGET_VERSION=<commit-sha-from-query>
echo "Target rollback version: ${TARGET_VERSION}"
```

#### Step 3: Stop Current Pipeline Execution (if running)

```bash
# Get current execution ID
EXECUTION_ID=$(aws codepipeline get-pipeline-state \
  --name kiro-pipeline-${ENVIRONMENT} \
  --query 'stageStates[0].latestExecution.pipelineExecutionId' \
  --output text)

# Stop pipeline execution
aws codepipeline stop-pipeline-execution \
  --pipeline-name kiro-pipeline-${ENVIRONMENT} \
  --pipeline-execution-id ${EXECUTION_ID} \
  --abandon \
  --reason "Manual rollback initiated due to deployment failure"

echo "Pipeline execution ${EXECUTION_ID} stopped"
```

#### Step 4: Rollback Infrastructure (if infrastructure changed)

```bash
# Check if infrastructure changed in failed deployment
INFRA_CHANGED=$(aws dynamodb get-item \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --key '{"deploymentId":{"S":"'${DEPLOYMENT_ID}'"}}' \
  --query 'Item.infrastructureChanged.BOOL' \
  --output text)

if [ "${INFRA_CHANGED}" = "true" ]; then
  echo "Infrastructure changed, rolling back CDK stacks..."
  
  # Navigate to infrastructure directory
  cd infrastructure
  
  # Checkout target version
  git checkout ${TARGET_VERSION}
  
  # Install dependencies
  npm ci
  
  # Deploy previous infrastructure version
  cdk deploy --all --context environment=${ENVIRONMENT} --require-approval never
  
  echo "Infrastructure rollback complete"
else
  echo "Infrastructure unchanged, skipping CDK rollback"
fi
```

#### Step 5: Rollback Application Code

```bash
# Retrieve previous application artifacts from S3
aws s3 cp \
  s3://kiro-pipeline-${ENVIRONMENT}-artifacts/${TARGET_VERSION}/ \
  ./rollback-artifacts/ \
  --recursive

# Deploy previous application version
# (This depends on your application deployment mechanism)
# For Kiro Worker, this typically means updating the CodeBuild worker configuration

# Option A: Update via S3 (if application is deployed from S3)
aws s3 sync ./rollback-artifacts/ s3://kiro-worker-${ENVIRONMENT}-artifacts/

# Option B: Trigger CodeBuild with specific version
aws codebuild start-build \
  --project-name kiro-worker-${ENVIRONMENT} \
  --source-version ${TARGET_VERSION}

echo "Application rollback initiated"
```

#### Step 6: Validate Rollback

```bash
# Wait for deployment to stabilize
echo "Waiting 60 seconds for deployment to stabilize..."
sleep 60

# Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --state-value ALARM

# If no alarms in ALARM state, rollback is successful
ALARM_COUNT=$(aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --state-value ALARM \
  --query 'length(MetricAlarms)' \
  --output text)

if [ "${ALARM_COUNT}" = "0" ]; then
  echo "✅ Rollback validation successful - no alarms in ALARM state"
else
  echo "❌ Rollback validation failed - ${ALARM_COUNT} alarms in ALARM state"
  aws cloudwatch describe-alarms \
    --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
    --state-value ALARM
fi

# Check application health (adjust URL for your application)
curl -f https://api.example.com/health || echo "❌ Health check failed"

# Verify deployed version
DEPLOYED_VERSION=$(aws s3api head-object \
  --bucket kiro-worker-${ENVIRONMENT}-artifacts \
  --key current-version.txt \
  --query 'Metadata.version' \
  --output text)

if [ "${DEPLOYED_VERSION}" = "${TARGET_VERSION}" ]; then
  echo "✅ Version verification successful"
else
  echo "❌ Version mismatch: deployed=${DEPLOYED_VERSION}, target=${TARGET_VERSION}"
fi
```

#### Step 7: Update Deployment Record

```bash
# Update DynamoDB deployment record
CURRENT_TIMESTAMP=$(date +%s)

aws dynamodb update-item \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --key '{"deploymentId":{"S":"'${DEPLOYMENT_ID}'"}}' \
  --update-expression "SET #status = :status, rollbackReason = :reason, rollbackLevel = :level, rollbackTime = :time, endTime = :endTime" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{
    ":status":{"S":"rolled_back"},
    ":reason":{"S":"Manual rollback to version '${TARGET_VERSION}'"},
    ":level":{"S":"manual"},
    ":time":{"N":"'${CURRENT_TIMESTAMP}'"},
    ":endTime":{"N":"'${CURRENT_TIMESTAMP}'"}
  }'

echo "Deployment record updated"
```

#### Step 8: Send Notifications

```bash
# Send SNS notification
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:kiro-pipeline-${ENVIRONMENT}-rollbacks \
  --subject "Manual Rollback Completed - ${ENVIRONMENT}" \
  --message '{
    "event": "manual_rollback_completed",
    "environment": "'${ENVIRONMENT}'",
    "currentVersion": "'${CURRENT_VERSION}'",
    "targetVersion": "'${TARGET_VERSION}'",
    "deploymentId": "'${DEPLOYMENT_ID}'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "operator": "'${USER}'",
    "validationStatus": "success"
  }'

echo "Notification sent"
```

### Manual Rollback Script

For convenience, a manual rollback script is provided:

```bash
#!/bin/bash
# infrastructure/scripts/manual-rollback.sh

set -e

# Usage: ./manual-rollback.sh <environment> <target-version>
# Example: ./manual-rollback.sh production abc123def456

ENVIRONMENT=$1
TARGET_VERSION=$2

if [ -z "${ENVIRONMENT}" ] || [ -z "${TARGET_VERSION}" ]; then
  echo "Usage: $0 <environment> <target-version>"
  echo "Example: $0 production abc123def456"
  exit 1
fi

echo "========================================="
echo "Manual Rollback Initiated"
echo "Environment: ${ENVIRONMENT}"
echo "Target Version: ${TARGET_VERSION}"
echo "========================================="

# Confirmation prompt
read -p "Are you sure you want to rollback ${ENVIRONMENT} to ${TARGET_VERSION}? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Execute rollback steps
echo "Step 1: Stopping current pipeline execution..."
# (Add commands from Step 3 above)

echo "Step 2: Rolling back infrastructure (if needed)..."
# (Add commands from Step 4 above)

echo "Step 3: Rolling back application code..."
# (Add commands from Step 5 above)

echo "Step 4: Validating rollback..."
# (Add commands from Step 6 above)

echo "Step 5: Updating deployment record..."
# (Add commands from Step 7 above)

echo "Step 6: Sending notifications..."
# (Add commands from Step 8 above)

echo "========================================="
echo "Manual Rollback Complete"
echo "========================================="
```

## Rollback Validation

### Automated Validation Process

The RollbackValidator component performs comprehensive validation after each rollback:

**Validation Sequence:**
1. **Stabilization Wait** (60 seconds)
   - Allows deployment to settle
   - Gives alarms time to update state
   - Ensures metrics are current

2. **Alarm State Verification**
   - Query all alarms with prefix `kiro-pipeline-{environment}`
   - Check for any alarms in ALARM state
   - Log alarm details if any are in ALARM state

3. **Health Check Execution**
   - Run application-specific health checks
   - Verify critical endpoints are accessible
   - Check response times and error rates

4. **Version Verification**
   - Confirm deployed version matches target version
   - Check artifact locations in S3
   - Verify deployment record in DynamoDB

5. **Log Analysis**
   - Check CloudWatch logs for errors in past 5 minutes
   - Look for deployment-related errors
   - Verify no critical errors logged

**Validation Result:**
```typescript
interface ValidationResult {
  success: boolean;
  reason?: string;
  failedAlarms?: AlarmInfo[];
  healthCheckStatus?: string;
  versionMatch?: boolean;
  timestamp: number;
}
```

### Manual Validation Steps

After manual rollback, perform these validation checks:

#### 1. Verify Pipeline State

```bash
# Check pipeline is not running
aws codepipeline get-pipeline-state \
  --name kiro-pipeline-${ENVIRONMENT} \
  --query 'stageStates[*].[stageName,latestExecution.status]' \
  --output table

# Expected: All stages should show "Succeeded" or "Stopped"
```

#### 2. Verify CloudWatch Alarms

```bash
# List all alarms and their states
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --query 'MetricAlarms[*].[AlarmName,StateValue,StateReason]' \
  --output table

# Expected: All alarms should be in "OK" or "INSUFFICIENT_DATA" state
# If any alarms are in "ALARM" state, investigate before proceeding
```

#### 3. Verify Application Health

```bash
# Check application endpoints
curl -f https://api.example.com/health
curl -f https://api.example.com/metrics

# Check application logs
aws logs tail /aws/lambda/kiro-worker-${ENVIRONMENT}-poller --follow --since 5m

# Expected: No errors in logs, health endpoints return 200 OK
```

#### 4. Verify Deployment Record

```bash
# Check DynamoDB deployment record
aws dynamodb get-item \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --key '{"deploymentId":{"S":"'${DEPLOYMENT_ID}'"}}' \
  --query 'Item.[status.S,version.S,rollbackLevel.S,rollbackReason.S]' \
  --output table

# Expected: status="rolled_back", version matches target version
```

#### 5. Verify Metrics

```bash
# Check deployment duration metric
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name DeploymentDuration \
  --dimensions Name=Environment,Value=${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average

# Check rollback count metric
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name RollbackCount \
  --dimensions Name=Environment,Value=${ENVIRONMENT} \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

#### 6. Verify Notifications

```bash
# Check SNS topic for rollback notification
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:kiro-pipeline-${ENVIRONMENT}-rollbacks

# Verify email/Slack notification was received
# Check notification contains correct deployment details
```

### Validation Checklist

Use this checklist to ensure rollback validation is complete:

- [ ] Pipeline execution stopped or completed
- [ ] All CloudWatch alarms in OK or INSUFFICIENT_DATA state
- [ ] Application health endpoints return 200 OK
- [ ] No errors in CloudWatch logs for past 5 minutes
- [ ] Deployed version matches target rollback version
- [ ] DynamoDB deployment record updated with rollback status
- [ ] Rollback metrics published to CloudWatch
- [ ] Notifications sent to SNS topics
- [ ] Stakeholders informed of rollback completion
- [ ] Incident ticket updated with rollback details

## Troubleshooting

### Common Rollback Issues

#### Issue 1: Rollback Lambda Not Triggered

**Symptoms:**
- Alarm enters ALARM state but rollback doesn't execute
- No rollback Lambda invocations in CloudWatch logs
- EventBridge rule not triggering

**Diagnosis:**
```bash
# Check EventBridge rule status
aws events describe-rule --name kiro-pipeline-${ENVIRONMENT}-alarm-rule

# Check Lambda function exists
aws lambda get-function --function-name kiro-pipeline-${ENVIRONMENT}-rollback

# Check EventBridge rule targets
aws events list-targets-by-rule --rule kiro-pipeline-${ENVIRONMENT}-alarm-rule

# Check Lambda CloudWatch logs
aws logs tail /aws/lambda/kiro-pipeline-${ENVIRONMENT}-rollback --since 1h
```

**Solutions:**
1. Verify EventBridge rule is enabled
2. Check Lambda function has correct permissions
3. Verify alarm name matches EventBridge rule pattern
4. Check Lambda Dead Letter Queue for failed invocations
5. Manually invoke Lambda with test event to verify functionality

**Manual Trigger:**
```bash
# Create test event
cat > test-alarm-event.json <<EOF
{
  "version": "0",
  "id": "test-event",
  "detail-type": "CloudWatch Alarm State Change",
  "source": "aws.cloudwatch",
  "account": "${AWS_ACCOUNT_ID}",
  "time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "region": "us-east-1",
  "detail": {
    "alarmName": "kiro-pipeline-${ENVIRONMENT}-failures",
    "state": {
      "value": "ALARM",
      "reason": "Test alarm for rollback",
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
  }
}
EOF

# Invoke Lambda manually
aws lambda invoke \
  --function-name kiro-pipeline-${ENVIRONMENT}-rollback \
  --payload file://test-alarm-event.json \
  --cli-binary-format raw-in-base64-out \
  response.json

cat response.json
```

#### Issue 2: Stage Rollback Fails

**Symptoms:**
- Stage-level rollback attempts but fails
- Error in rollback Lambda logs
- Deployment remains in failed state

**Diagnosis:**
```bash
# Check rollback Lambda logs for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/kiro-pipeline-${ENVIRONMENT}-rollback \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"

# Check deployment record
aws dynamodb get-item \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --key '{"deploymentId":{"S":"'${DEPLOYMENT_ID}'"}}'

# Check previous deployment exists
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env AND #status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"},":status":{"S":"succeeded"}}' \
  --scan-index-forward false \
  --limit 1
```

**Solutions:**
1. Verify previous deployment record exists in DynamoDB
2. Check artifacts for previous version exist in S3
3. Verify IAM permissions for rollback Lambda
4. Check for infrastructure drift (CDK diff)
5. Attempt manual rollback following procedures above
6. If stage rollback continues to fail, full rollback should trigger automatically

#### Issue 3: Full Rollback Fails

**Symptoms:**
- Both stage and full rollback attempts fail
- Critical incident - service may be degraded
- Manual intervention required

**Diagnosis:**
```bash
# Check rollback attempts in DynamoDB
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"}}' \
  --scan-index-forward false \
  --limit 5

# Check all environment states
for ENV in test staging production; do
  echo "=== ${ENV} ==="
  aws codepipeline get-pipeline-state --name kiro-pipeline-${ENV}
done

# Check CloudWatch alarms across all environments
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline \
  --state-value ALARM
```

**Solutions:**
1. **Immediate**: Follow manual rollback procedures for each environment
2. **Escalate**: Contact incident commander and senior engineers
3. **Isolate**: If production is affected, consider traffic routing to previous version
4. **Investigate**: Determine root cause of rollback failures
5. **Document**: Record all actions taken for post-incident review

**Emergency Rollback:**
```bash
# Stop all pipeline executions
for ENV in test staging production; do
  EXEC_ID=$(aws codepipeline get-pipeline-state \
    --name kiro-pipeline-${ENV} \
    --query 'stageStates[0].latestExecution.pipelineExecutionId' \
    --output text)
  
  if [ "${EXEC_ID}" != "None" ]; then
    aws codepipeline stop-pipeline-execution \
      --pipeline-name kiro-pipeline-${ENV} \
      --pipeline-execution-id ${EXEC_ID} \
      --abandon \
      --reason "Emergency rollback - full rollback failed"
  fi
done

# Manually rollback each environment
for ENV in test staging production; do
  echo "Rolling back ${ENV}..."
  ./infrastructure/scripts/manual-rollback.sh ${ENV} ${TARGET_VERSION}
done
```

#### Issue 4: Rollback Validation Fails

**Symptoms:**
- Rollback executes but validation fails
- Alarms remain in ALARM state after rollback
- Health checks fail after rollback

**Diagnosis:**
```bash
# Check which alarms are failing
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --state-value ALARM \
  --query 'MetricAlarms[*].[AlarmName,StateReason]' \
  --output table

# Check application logs
aws logs tail /aws/lambda/kiro-worker-${ENVIRONMENT}-poller --since 10m

# Check health endpoint
curl -v https://api.example.com/health

# Check recent deployments
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"}}' \
  --scan-index-forward false \
  --limit 3
```

**Solutions:**
1. **Wait and Retry**: Sometimes alarms need time to clear (wait 5 minutes)
2. **Check Root Cause**: Investigate why alarms are still firing
3. **Verify Version**: Ensure correct version was deployed
4. **Check Dependencies**: Verify external dependencies are healthy
5. **Manual Validation**: Override validation if alarms are false positives
6. **Rollback Further**: If current version is still problematic, rollback to earlier version

#### Issue 5: Artifacts Not Found

**Symptoms:**
- Rollback fails with "artifact not found" error
- Previous version artifacts missing from S3
- Cannot retrieve deployment package

**Diagnosis:**
```bash
# Check S3 bucket for artifacts
aws s3 ls s3://kiro-pipeline-${ENVIRONMENT}-artifacts/ --recursive | grep ${TARGET_VERSION}

# Check artifact lifecycle policies
aws s3api get-bucket-lifecycle-configuration \
  --bucket kiro-pipeline-${ENVIRONMENT}-artifacts

# Check deployment record for artifact location
aws dynamodb get-item \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --key '{"deploymentId":{"S":"'${DEPLOYMENT_ID}'"}}' \
  --query 'Item.artifactLocation.S'
```

**Solutions:**
1. **Check Lifecycle Policies**: Artifacts may have been deleted by lifecycle rules
2. **Restore from Backup**: If S3 versioning enabled, restore previous version
3. **Rebuild Artifacts**: Checkout target version from Git and rebuild
4. **Use Earlier Version**: Rollback to an even earlier version with available artifacts
5. **Update Lifecycle Policies**: Extend retention period to prevent future issues

**Rebuild Artifacts:**
```bash
# Checkout target version
git checkout ${TARGET_VERSION}

# Rebuild application
npm ci
npm run build

# Upload to S3
aws s3 sync dist/ s3://kiro-pipeline-${ENVIRONMENT}-artifacts/${TARGET_VERSION}/
```

#### Issue 6: DynamoDB Record Inconsistency

**Symptoms:**
- Deployment record doesn't match actual state
- Cannot find last known good deployment
- Rollback target version unclear

**Diagnosis:**
```bash
# List recent deployments
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"}}' \
  --scan-index-forward false \
  --limit 10 \
  --query 'Items[*].[deploymentId.S,version.S,status.S,startTime.N]' \
  --output table

# Check for orphaned records
aws dynamodb scan \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --filter-expression "#status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{":status":{"S":"in_progress"}}'

# Verify against Git history
git log --oneline --since="7 days ago" origin/main
```

**Solutions:**
1. **Manual Correction**: Update DynamoDB record to match actual state
2. **Use Git History**: Determine last known good version from Git tags/commits
3. **Check CloudWatch Logs**: Review deployment logs to determine actual state
4. **Verify with Team**: Confirm last successful deployment with team members
5. **Update Record**: Manually update deployment record with correct information

**Update DynamoDB Record:**
```bash
# Update deployment status
aws dynamodb update-item \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --key '{"deploymentId":{"S":"'${DEPLOYMENT_ID}'"}}' \
  --update-expression "SET #status = :status, endTime = :endTime" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{
    ":status":{"S":"failed"},
    ":endTime":{"N":"'$(date +%s)'"}
  }'
```

### Rollback Troubleshooting Checklist

When troubleshooting rollback issues, work through this checklist:

- [ ] Check rollback Lambda CloudWatch logs for errors
- [ ] Verify EventBridge rule is enabled and configured correctly
- [ ] Confirm previous deployment record exists in DynamoDB
- [ ] Verify artifacts for target version exist in S3
- [ ] Check IAM permissions for rollback Lambda and CodePipeline
- [ ] Verify CloudWatch alarms are configured correctly
- [ ] Check for infrastructure drift using CDK diff
- [ ] Verify network connectivity and AWS service health
- [ ] Check Dead Letter Queue for failed Lambda invocations
- [ ] Review recent changes to pipeline infrastructure
- [ ] Verify secrets and parameters are accessible
- [ ] Check for concurrent deployments or locks
- [ ] Review CloudWatch metrics for anomalies
- [ ] Verify Git repository state and commit history
- [ ] Check S3 bucket lifecycle policies and versioning

## Example Commands

### Quick Reference Commands

#### Check Deployment Status

```bash
# Get current deployment status
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env" \
  --expression-attribute-values '{":env":{"S":"'${ENVIRONMENT}'"}}' \
  --scan-index-forward false \
  --limit 1 \
  --query 'Items[0].[deploymentId.S,version.S,status.S]' \
  --output table
```

#### Check Pipeline State

```bash
# Get pipeline execution state
aws codepipeline get-pipeline-state \
  --name kiro-pipeline-${ENVIRONMENT} \
  --query 'stageStates[*].[stageName,latestExecution.status]' \
  --output table
```

#### Check Alarms

```bash
# List alarms in ALARM state
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --state-value ALARM \
  --query 'MetricAlarms[*].[AlarmName,StateReason]' \
  --output table
```

#### Trigger Manual Rollback

```bash
# Complete manual rollback
export ENVIRONMENT=production
export TARGET_VERSION=abc123def456

# 1. Stop pipeline
EXEC_ID=$(aws codepipeline get-pipeline-state \
  --name kiro-pipeline-${ENVIRONMENT} \
  --query 'stageStates[0].latestExecution.pipelineExecutionId' \
  --output text)

aws codepipeline stop-pipeline-execution \
  --pipeline-name kiro-pipeline-${ENVIRONMENT} \
  --pipeline-execution-id ${EXEC_ID} \
  --abandon

# 2. Rollback infrastructure (if needed)
cd infrastructure
git checkout ${TARGET_VERSION}
npm ci
cdk deploy --all --context environment=${ENVIRONMENT}

# 3. Rollback application
aws s3 sync \
  s3://kiro-pipeline-${ENVIRONMENT}-artifacts/${TARGET_VERSION}/ \
  s3://kiro-worker-${ENVIRONMENT}-artifacts/

# 4. Validate
sleep 60
aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --state-value ALARM
```

#### Check Rollback History

```bash
# List all rollbacks in past 7 days
aws dynamodb query \
  --table-name kiro-pipeline-${ENVIRONMENT}-deployments \
  --index-name EnvironmentStatusIndex \
  --key-condition-expression "environment = :env AND #status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{
    ":env":{"S":"'${ENVIRONMENT}'"},
    ":status":{"S":"rolled_back"}
  }' \
  --scan-index-forward false \
  --query 'Items[*].[deploymentId.S,version.S,rollbackReason.S,rollbackTime.N]' \
  --output table
```

#### View Rollback Metrics

```bash
# Get rollback count for past 24 hours
aws cloudwatch get-metric-statistics \
  --namespace KiroPipeline \
  --metric-name RollbackCount \
  --dimensions Name=Environment,Value=${ENVIRONMENT} \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --query 'Datapoints[*].[Timestamp,Sum]' \
  --output table
```

#### Test Rollback Lambda

```bash
# Invoke rollback Lambda with test event
aws lambda invoke \
  --function-name kiro-pipeline-${ENVIRONMENT}-rollback \
  --payload '{
    "version": "0",
    "detail-type": "CloudWatch Alarm State Change",
    "source": "aws.cloudwatch",
    "detail": {
      "alarmName": "kiro-pipeline-'${ENVIRONMENT}'-test",
      "state": {"value": "ALARM"}
    }
  }' \
  --cli-binary-format raw-in-base64-out \
  response.json

cat response.json
```

#### View Rollback Logs

```bash
# Tail rollback Lambda logs
aws logs tail /aws/lambda/kiro-pipeline-${ENVIRONMENT}-rollback \
  --follow \
  --format short

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/kiro-pipeline-${ENVIRONMENT}-rollback \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR" \
  --query 'events[*].message' \
  --output text
```

## Recovery Procedures

### Post-Rollback Recovery

After a successful rollback, follow these steps to recover and prevent future issues:

#### 1. Root Cause Analysis

```bash
# Gather deployment logs
aws logs filter-log-events \
  --log-group-name /aws/codepipeline/kiro-pipeline-${ENVIRONMENT} \
  --start-time $(date -u -d '2 hours ago' +%s)000 \
  --end-time $(date -u +%s)000 > deployment-logs.txt

# Gather test results
aws codebuild batch-get-builds \
  --ids ${BUILD_ID} \
  --query 'builds[0].logs' > test-logs.txt

# Gather alarm history
aws cloudwatch describe-alarm-history \
  --alarm-name kiro-pipeline-${ENVIRONMENT}-failures \
  --start-date $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --history-item-type StateUpdate > alarm-history.txt
```

**Analysis Questions:**
- What triggered the rollback? (test failure, alarm, security scan, timeout)
- What changed in the failed deployment? (code, infrastructure, dependencies)
- Were there any warnings or errors before the failure?
- Did similar issues occur in test or staging environments?
- Are there patterns in recent rollbacks?

#### 2. Fix and Retest

```bash
# Create fix branch
git checkout -b fix/rollback-issue-${DEPLOYMENT_ID}

# Make necessary fixes
# ... edit code ...

# Test locally
npm test
npm run test:coverage

# Commit and push
git add .
git commit -m "fix: address rollback issue from deployment ${DEPLOYMENT_ID}"
git push origin fix/rollback-issue-${DEPLOYMENT_ID}

# Create pull request
# Wait for CI/CD to pass
# Get code review approval
# Merge to main
```

#### 3. Monitor Redeployment

```bash
# Monitor new deployment
watch -n 30 'aws codepipeline get-pipeline-state \
  --name kiro-pipeline-${ENVIRONMENT} \
  --query "stageStates[*].[stageName,latestExecution.status]" \
  --output table'

# Monitor alarms
watch -n 30 'aws cloudwatch describe-alarms \
  --alarm-name-prefix kiro-pipeline-${ENVIRONMENT} \
  --state-value ALARM \
  --query "length(MetricAlarms)"'

# Monitor application health
watch -n 10 'curl -s https://api.example.com/health | jq .'
```

#### 4. Update Documentation

- Document the incident in incident log
- Update runbook with lessons learned
- Add new troubleshooting steps if applicable
- Update alarm thresholds if needed
- Share findings with team in retrospective

#### 5. Preventive Measures

**Improve Testing:**
```bash
# Add tests for the failure scenario
# Update test coverage requirements
# Add property-based tests for edge cases
# Enhance integration test coverage
```

**Improve Monitoring:**
```bash
# Add new CloudWatch alarms for early detection
# Adjust alarm thresholds based on incident
# Add custom metrics for better visibility
# Enhance dashboard with new widgets
```

**Improve Deployment Process:**
```bash
# Add pre-deployment validation checks
# Enhance security scanning rules
# Improve rollback validation
# Add deployment smoke tests
```

### Rollback Failure Recovery

If automated rollback fails and manual rollback also fails:

#### Emergency Response Plan

**Phase 1: Immediate Stabilization (0-15 minutes)**

1. **Assess Impact**
   ```bash
   # Check service health across all environments
   for ENV in test staging production; do
     echo "=== ${ENV} ==="
     curl -s https://${ENV}.api.example.com/health || echo "FAILED"
   done
   ```

2. **Isolate Problem**
   ```bash
   # Stop all pipeline executions
   for ENV in test staging production; do
     aws codepipeline stop-pipeline-execution \
       --pipeline-name kiro-pipeline-${ENV} \
       --pipeline-execution-id $(aws codepipeline get-pipeline-state \
         --name kiro-pipeline-${ENV} \
         --query 'stageStates[0].latestExecution.pipelineExecutionId' \
         --output text) \
       --abandon || true
   done
   ```

3. **Escalate**
   - Notify incident commander
   - Page on-call senior engineer
   - Open war room / incident channel
   - Notify stakeholders of service degradation

**Phase 2: Manual Recovery (15-60 minutes)**

1. **Identify Last Known Good State**
   ```bash
   # Check Git history
   git log --oneline --since="7 days ago" origin/main
   
   # Check deployment history
   aws dynamodb query \
     --table-name kiro-pipeline-production-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env AND #status = :status" \
     --expression-attribute-names '{"#status":"status"}' \
     --expression-attribute-values '{
       ":env":{"S":"production"},
       ":status":{"S":"succeeded"}
     }' \
     --scan-index-forward false \
     --limit 5
   ```

2. **Manual Infrastructure Rollback**
   ```bash
   # Rollback CDK stacks manually
   cd infrastructure
   git checkout ${LAST_KNOWN_GOOD_VERSION}
   npm ci
   
   # Deploy each stack individually
   cdk deploy KiroPipelineCore --context environment=production --force
   cdk deploy KiroPipeline --context environment=production --force
   cdk deploy KiroPipelineMonitoring --context environment=production --force
   ```

3. **Manual Application Rollback**
   ```bash
   # Rebuild application from last known good version
   git checkout ${LAST_KNOWN_GOOD_VERSION}
   npm ci
   npm run build
   
   # Deploy manually
   aws s3 sync dist/ s3://kiro-worker-production-artifacts/
   
   # Restart services if needed
   aws lambda update-function-code \
     --function-name kiro-worker-production-poller \
     --s3-bucket kiro-worker-production-artifacts \
     --s3-key lambda-package.zip
   ```

4. **Verify Recovery**
   ```bash
   # Wait for stabilization
   sleep 120
   
   # Check all systems
   ./infrastructure/scripts/validate-deployment.sh production
   
   # Monitor for 15 minutes
   watch -n 30 'aws cloudwatch describe-alarms \
     --alarm-name-prefix kiro-pipeline-production \
     --state-value ALARM'
   ```

**Phase 3: Post-Incident (1-24 hours)**

1. **Document Incident**
   - Timeline of events
   - Actions taken
   - Root cause analysis
   - Impact assessment
   - Lessons learned

2. **Schedule Post-Mortem**
   - Invite all stakeholders
   - Review incident timeline
   - Identify improvement opportunities
   - Create action items

3. **Implement Improvements**
   - Fix identified issues
   - Enhance monitoring
   - Update runbooks
   - Improve rollback procedures
   - Add preventive measures

### Rollback Testing

Regularly test rollback procedures to ensure they work when needed:

#### Monthly Rollback Drill

```bash
# 1. Deploy test version to test environment
git checkout -b rollback-drill-$(date +%Y%m%d)
echo "// Rollback drill" >> src/index.ts
git commit -am "test: rollback drill"
git push origin rollback-drill-$(date +%Y%m%d)

# Merge to main to trigger deployment
# Wait for deployment to complete

# 2. Trigger rollback
aws lambda invoke \
  --function-name kiro-pipeline-test-rollback \
  --payload '{
    "version": "0",
    "detail-type": "CloudWatch Alarm State Change",
    "source": "aws.cloudwatch",
    "detail": {
      "alarmName": "kiro-pipeline-test-drill",
      "state": {"value": "ALARM"}
    }
  }' \
  --cli-binary-format raw-in-base64-out \
  response.json

# 3. Verify rollback completes successfully
# 4. Document results and any issues found
# 5. Update procedures based on findings
```

## Summary

### Key Takeaways

1. **Automated Rollback**: System automatically rolls back on failures (tests, security, alarms)
2. **Two Levels**: Stage-level (fast, single environment) and full (all environments)
3. **Comprehensive Validation**: Alarms, health checks, version verification
4. **Manual Procedures**: Available when automated rollback fails
5. **Fast Recovery**: Target < 15 minutes for rollback completion
6. **Idempotent**: Safe to execute multiple times
7. **Well-Monitored**: Metrics, logs, and notifications for all rollback events

### Best Practices

- ✅ Monitor rollback metrics and trends
- ✅ Test rollback procedures regularly
- ✅ Keep deployment history for at least 90 days
- ✅ Maintain clear communication during rollbacks
- ✅ Document all manual interventions
- ✅ Conduct post-mortems after rollback failures
- ✅ Continuously improve rollback procedures
- ✅ Train team members on rollback procedures
- ✅ Keep runbooks up to date
- ✅ Verify artifacts are retained for rollback

### Support and Escalation

**For Rollback Issues:**
1. Check this documentation first
2. Review CloudWatch logs and metrics
3. Consult with on-call engineer
4. Escalate to incident commander if needed
5. Contact AWS support for infrastructure issues

**Emergency Contacts:**
- On-Call Engineer: [pager/phone]
- Incident Commander: [pager/phone]
- DevOps Team: [slack channel]
- AWS Support: [support case portal]

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-27  
**Maintained By**: DevOps Team  
**Review Frequency**: Quarterly or after major incidents
