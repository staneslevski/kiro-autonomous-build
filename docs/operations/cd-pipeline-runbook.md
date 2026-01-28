# CD Pipeline Operations Runbook

## Overview

This runbook provides step-by-step procedures for common operational tasks and incident response for the Kiro CodeBuild Worker CD pipeline. It is designed for on-call engineers and operations teams.

## Table of Contents

1. [Common Operational Tasks](#common-operational-tasks)
2. [Incident Response Procedures](#incident-response-procedures)
3. [Escalation Paths](#escalation-paths)
4. [Emergency Contacts](#emergency-contacts)

## Common Operational Tasks

### Task 1: Trigger Manual Deployment

**When to Use**: Deploy specific commit outside normal workflow

**Prerequisites**:
- AWS CLI configured
- Appropriate IAM permissions
- Commit SHA to deploy

**Procedure**:

1. **Verify commit exists**:
   ```bash
   git log --oneline | grep <commit-sha>
   ```

2. **Trigger pipeline execution**:
   ```bash
   aws codepipeline start-pipeline-execution \
     --name kiro-pipeline-test \
     --client-request-token $(uuidgen)
   ```

3. **Monitor execution**:
   ```bash
   # Get execution ID from previous command output
   aws codepipeline get-pipeline-execution \
     --pipeline-name kiro-pipeline-test \
     --pipeline-execution-id <execution-id>
   ```

4. **Verify deployment**:
   ```bash
   # Check deployment record in DynamoDB
   aws dynamodb get-item \
     --table-name kiro-pipeline-test-deployments \
     --key '{"deploymentId":{"S":"test#<timestamp>"}}'
   ```

**Expected Duration**: 30-60 minutes

**Success Criteria**:
- Pipeline execution status: Succeeded
- All stages completed successfully
- Deployment record shows status: succeeded

**Rollback**: If deployment fails, automated rollback will trigger


### Task 2: Approve Production Deployment

**When to Use**: Manual approval required before production deployment

**Prerequisites**:
- Pipeline execution waiting for approval
- Approval notification received
- Review of test results completed

**Procedure**:

1. **Locate approval action**:
   ```bash
   # Get pipeline state
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-production
   
   # Look for stage with status "InProgress" and action "ManualApproval"
   ```

2. **Review deployment details**:
   - Check test results in CodeBuild
   - Review staging deployment success
   - Verify no critical alarms
   - Check recent code changes

3. **Approve via AWS Console**:
   - Navigate to CodePipeline → kiro-pipeline-production
   - Click "Review" on approval action
   - Add approval comments
   - Click "Approve"

4. **Approve via AWS CLI**:
   ```bash
   aws codepipeline put-approval-result \
     --pipeline-name kiro-pipeline-production \
     --stage-name ProductionEnvironment \
     --action-name Approve_Production_Deployment \
     --result status=Approved,summary="Reviewed and approved by <your-name>" \
     --token <approval-token>
   ```

5. **Monitor production deployment**:
   ```bash
   # Watch pipeline progress
   watch -n 30 'aws codepipeline get-pipeline-state --name kiro-pipeline-production'
   ```

**Expected Duration**: 15-20 minutes after approval

**Success Criteria**:
- Production stage completes successfully
- Health checks pass
- No alarms triggered

**Rejection**: If issues found, reject approval and investigate

### Task 3: Check Pipeline Status

**When to Use**: Verify current pipeline state and recent executions

**Prerequisites**:
- AWS CLI configured

**Procedure**:

1. **Get current pipeline state**:
   ```bash
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-test \
     --query 'stageStates[*].[stageName,latestExecution.status]' \
     --output table
   ```

2. **List recent executions**:
   ```bash
   aws codepipeline list-pipeline-executions \
     --pipeline-name kiro-pipeline-test \
     --max-results 10 \
     --query 'pipelineExecutionSummaries[*].[pipelineExecutionId,status,startTime]' \
     --output table
   ```

3. **Get execution details**:
   ```bash
   aws codepipeline get-pipeline-execution \
     --pipeline-name kiro-pipeline-test \
     --pipeline-execution-id <execution-id>
   ```

4. **Check deployment records**:
   ```bash
   aws dynamodb query \
     --table-name kiro-pipeline-test-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --expression-attribute-values '{":env":{"S":"test"}}' \
     --limit 5 \
     --scan-index-forward false
   ```

**Output Interpretation**:
- **InProgress**: Pipeline currently executing
- **Succeeded**: Completed successfully
- **Failed**: Execution failed (check logs)
- **Stopped**: Manually stopped or rollback triggered


### Task 4: Stop Running Pipeline

**When to Use**: Emergency stop of problematic deployment

**Prerequisites**:
- AWS CLI configured
- Pipeline execution ID
- Approval from engineering manager

**Procedure**:

1. **Get current execution ID**:
   ```bash
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-production \
     --query 'stageStates[0].latestExecution.pipelineExecutionId' \
     --output text
   ```

2. **Stop pipeline execution**:
   ```bash
   aws codepipeline stop-pipeline-execution \
     --pipeline-name kiro-pipeline-production \
     --pipeline-execution-id <execution-id> \
     --abandon \
     --reason "Emergency stop: <reason>"
   ```

3. **Verify stopped**:
   ```bash
   aws codepipeline get-pipeline-execution \
     --pipeline-name kiro-pipeline-production \
     --pipeline-execution-id <execution-id> \
     --query 'pipelineExecution.status'
   ```

4. **Notify team**:
   - Post in #devops-pipeline Slack channel
   - Send email to devops-team@example.com
   - Document reason in incident log

**Post-Stop Actions**:
- Investigate root cause
- Determine if rollback needed
- Plan remediation
- Resume deployments when safe

**Warning**: Stopping pipeline does NOT rollback deployed changes. Manual rollback may be required.

### Task 5: View Pipeline Logs

**When to Use**: Troubleshoot failures or investigate issues

**Prerequisites**:
- AWS CLI configured
- Log group name
- Approximate time of issue

**Procedure**:

1. **Identify relevant log group**:
   - Pipeline: `/aws/codepipeline/kiro-pipeline-{env}`
   - Build: `/aws/codebuild/kiro-pipeline-{env}-build`
   - Tests: `/aws/codebuild/kiro-pipeline-{env}-integration-test`
   - Rollback: `/aws/lambda/kiro-pipeline-{env}-rollback`

2. **Tail logs in real-time**:
   ```bash
   aws logs tail /aws/codebuild/kiro-pipeline-test-build --follow
   ```

3. **Search logs for errors**:
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/codebuild/kiro-pipeline-test-build \
     --start-time $(date -u -d '1 hour ago' +%s)000 \
     --filter-pattern "ERROR"
   ```

4. **Get specific log stream**:
   ```bash
   # List recent streams
   aws logs describe-log-streams \
     --log-group-name /aws/codebuild/kiro-pipeline-test-build \
     --order-by LastEventTime \
     --descending \
     --max-items 5
   
   # Get stream events
   aws logs get-log-events \
     --log-group-name /aws/codebuild/kiro-pipeline-test-build \
     --log-stream-name <stream-name>
   ```

5. **Use CloudWatch Insights**:
   ```bash
   aws logs start-query \
     --log-group-name /aws/codebuild/kiro-pipeline-test-build \
     --start-time $(date -u -d '1 hour ago' +%s) \
     --end-time $(date -u +%s) \
     --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc'
   ```

**Common Log Patterns**:
- Build failures: `ERROR` or `FAILED`
- Test failures: `FAIL` or `✗`
- Deployment errors: `deployment failed`
- Rollback events: `Rollback initiated`


### Task 6: Update Alarm Thresholds

**When to Use**: Adjust alarm sensitivity based on operational experience

**Prerequisites**:
- AWS CLI configured
- Analysis of false positive/negative rate
- Approval from team lead

**Procedure**:

1. **Review current alarm configuration**:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-names kiro-pipeline-test-failures \
     --query 'MetricAlarms[0].[Threshold,EvaluationPeriods,Period]'
   ```

2. **Analyze alarm history**:
   ```bash
   aws cloudwatch describe-alarm-history \
     --alarm-name kiro-pipeline-test-failures \
     --max-records 20 \
     --history-item-type StateUpdate
   ```

3. **Update alarm threshold** (temporary):
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name kiro-pipeline-test-failures \
     --alarm-description "Pipeline failure rate alarm" \
     --metric-name PipelineExecutionFailure \
     --namespace AWS/CodePipeline \
     --statistic Sum \
     --period 3600 \
     --evaluation-periods 1 \
     --threshold 5 \
     --comparison-operator GreaterThanThreshold \
     --dimensions Name=PipelineName,Value=kiro-pipeline-test
   ```

4. **Update via CDK** (permanent):
   ```bash
   # Edit infrastructure/lib/stacks/monitoring-alerting-stack.ts
   # Update threshold value
   # Deploy changes
   cd infrastructure
   cdk deploy KiroPipelineMonitoring --context environment=test
   ```

5. **Verify update**:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-names kiro-pipeline-test-failures
   ```

6. **Document change**:
   - Update monitoring documentation
   - Record in change log
   - Notify team

**Recommended Thresholds**:
- Pipeline failures: 3-5 per hour
- Rollbacks: 2-3 per hour
- Deployment duration: 3600-4500 seconds

### Task 7: Query Deployment History

**When to Use**: Audit deployments, investigate patterns, generate reports

**Prerequisites**:
- AWS CLI configured
- DynamoDB table access

**Procedure**:

1. **Query by environment**:
   ```bash
   aws dynamodb query \
     --table-name kiro-pipeline-production-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --expression-attribute-values '{":env":{"S":"production"}}' \
     --limit 20 \
     --scan-index-forward false
   ```

2. **Query by status**:
   ```bash
   aws dynamodb query \
     --table-name kiro-pipeline-production-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env AND #status = :status" \
     --expression-attribute-names '{"#status":"status"}' \
     --expression-attribute-values '{":env":{"S":"production"},":status":{"S":"succeeded"}}' \
     --limit 10
   ```

3. **Get specific deployment**:
   ```bash
   aws dynamodb get-item \
     --table-name kiro-pipeline-production-deployments \
     --key '{"deploymentId":{"S":"production#1706313600000"}}'
   ```

4. **Calculate metrics**:
   ```bash
   # Deployment frequency (last 24 hours)
   aws dynamodb query \
     --table-name kiro-pipeline-production-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --filter-expression "startTime > :yesterday" \
     --expression-attribute-values '{":env":{"S":"production"},":yesterday":{"N":"'$(date -u -d '1 day ago' +%s)'"}}' \
     --select COUNT
   ```

5. **Export to CSV** (for reporting):
   ```bash
   aws dynamodb scan \
     --table-name kiro-pipeline-production-deployments \
     --output json | \
     jq -r '.Items[] | [.deploymentId.S, .environment.S, .status.S, .startTime.N] | @csv' > deployments.csv
   ```

**Useful Queries**:
- Failed deployments in last week
- Average deployment duration by environment
- Rollback frequency and reasons
- Deployments by commit author


## Incident Response Procedures

### Incident 1: Pipeline Failure

**Severity**: Medium to High (depending on environment)

**Symptoms**:
- Pipeline execution status: Failed
- Alarm: kiro-pipeline-{env}-failures in ALARM state
- Notification received

**Response Procedure**:

1. **Acknowledge incident** (< 5 minutes):
   ```bash
   # Acknowledge in PagerDuty or incident management system
   # Post in #devops-pipeline: "Investigating pipeline failure in {env}"
   ```

2. **Assess impact** (< 10 minutes):
   - Which environment? (test/staging/production)
   - Which stage failed? (build/test/deploy)
   - Is production affected?
   - Are users impacted?

3. **Identify root cause** (< 15 minutes):
   ```bash
   # Get pipeline state
   aws codepipeline get-pipeline-state --name kiro-pipeline-{env}
   
   # Check failed stage logs
   aws logs tail /aws/codebuild/kiro-pipeline-{env}-{stage} --since 1h
   
   # Check for recent code changes
   git log --oneline -10
   ```

4. **Determine action**:
   - **Test/Staging failure**: Investigate and fix, no immediate rollback needed
   - **Production failure**: Automated rollback should trigger; verify it completes
   - **Build failure**: Fix code and re-trigger
   - **Test failure**: Fix tests or code, re-trigger
   - **Deployment failure**: Check AWS service health, retry or rollback

5. **Execute remediation**:
   
   **If code issue**:
   ```bash
   # Fix code
   git commit -m "fix: resolve pipeline failure"
   git push origin main
   # Pipeline will auto-trigger
   ```
   
   **If infrastructure issue**:
   ```bash
   # Check AWS service health
   aws health describe-events --filter eventTypeCategories=issue
   
   # If AWS issue, wait for resolution
   # If our infrastructure issue, fix and redeploy
   ```
   
   **If transient failure**:
   ```bash
   # Retry pipeline
   aws codepipeline start-pipeline-execution \
     --name kiro-pipeline-{env}
   ```

6. **Verify resolution** (< 30 minutes total):
   ```bash
   # Monitor new execution
   watch -n 30 'aws codepipeline get-pipeline-state --name kiro-pipeline-{env}'
   
   # Verify deployment record
   aws dynamodb query \
     --table-name kiro-pipeline-{env}-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --expression-attribute-values '{":env":{"S":"{env}"}}' \
     --limit 1 \
     --scan-index-forward false
   ```

7. **Post-incident**:
   - Document root cause
   - Update runbook if needed
   - Schedule post-mortem if production impacted
   - Update monitoring/alarms if false positive

**Escalation Criteria**:
- Cannot identify root cause within 15 minutes
- Production is down or degraded
- Rollback fails
- Multiple consecutive failures


### Incident 2: Rollback Failure

**Severity**: Critical

**Symptoms**:
- Rollback Lambda execution failed
- Notification: "Rollback failed"
- Deployment still in failed state
- Alarm: kiro-pipeline-{env}-rollbacks in ALARM state

**Response Procedure**:

1. **Immediate actions** (< 2 minutes):
   ```bash
   # Page on-call engineer immediately
   # Post in #devops-pipeline: "CRITICAL: Rollback failure in {env}"
   # Escalate to engineering manager
   ```

2. **Assess situation** (< 5 minutes):
   ```bash
   # Check rollback Lambda logs
   aws logs tail /aws/lambda/kiro-pipeline-{env}-rollback --since 30m
   
   # Check deployment record
   aws dynamodb get-item \
     --table-name kiro-pipeline-{env}-deployments \
     --key '{"deploymentId":{"S":"{env}#<timestamp>"}}'
   
   # Check current application state
   # Verify if application is running (degraded or down?)
   ```

3. **Determine rollback level**:
   - **Stage rollback failed**: Attempt full rollback
   - **Full rollback failed**: Manual intervention required

4. **Attempt manual rollback** (< 15 minutes):
   
   **Option A: Trigger rollback Lambda manually**:
   ```bash
   # Create test event
   cat > rollback-event.json <<EOF
   {
     "version": "0",
     "id": "manual-trigger",
     "detail-type": "Manual Rollback",
     "source": "manual",
     "detail": {
       "deploymentId": "{env}#<timestamp>",
       "reason": "Manual rollback after automated failure"
     }
   }
   EOF
   
   # Invoke Lambda
   aws lambda invoke \
     --function-name kiro-pipeline-{env}-rollback \
     --payload file://rollback-event.json \
     --log-type Tail \
     response.json
   ```
   
   **Option B: Manual CDK rollback**:
   ```bash
   # Get last known good version from DynamoDB
   aws dynamodb query \
     --table-name kiro-pipeline-{env}-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env AND #status = :status" \
     --expression-attribute-names '{"#status":"status"}' \
     --expression-attribute-values '{":env":{"S":"{env}"},":status":{"S":"succeeded"}}' \
     --limit 1 \
     --scan-index-forward false
   
   # Checkout that version
   git checkout <last-good-commit-sha>
   
   # Deploy manually
   cd infrastructure
   cdk deploy --all --context environment={env}
   ```
   
   **Option C: CloudFormation rollback**:
   ```bash
   # List recent stack updates
   aws cloudformation describe-stack-events \
     --stack-name KiroWorkerCodeBuild-{env} \
     --max-items 20
   
   # Rollback to previous version
   aws cloudformation rollback-stack \
     --stack-name KiroWorkerCodeBuild-{env}
   ```

5. **Verify manual rollback** (< 20 minutes total):
   ```bash
   # Check application health
   # Run smoke tests
   # Verify alarms return to OK state
   
   # Update deployment record
   aws dynamodb update-item \
     --table-name kiro-pipeline-{env}-deployments \
     --key '{"deploymentId":{"S":"{env}#<timestamp>"}}' \
     --update-expression "SET #status = :status, rollbackTime = :time" \
     --expression-attribute-names '{"#status":"status"}' \
     --expression-attribute-values '{":status":{"S":"rolled_back"},":time":{"N":"'$(date +%s)'"}}'
   ```

6. **Post-incident** (< 24 hours):
   - **CRITICAL**: Schedule immediate post-mortem
   - Document exact failure sequence
   - Identify rollback system bugs
   - Create tickets for fixes
   - Test rollback system thoroughly
   - Update rollback procedures

**Escalation**:
- Immediate escalation to engineering manager
- If manual rollback fails, escalate to CTO
- Consider emergency maintenance window

**Prevention**:
- Regular rollback testing (monthly)
- Rollback system monitoring
- Comprehensive rollback validation


### Incident 3: Alarm Investigation

**Severity**: Low to Medium

**Symptoms**:
- CloudWatch alarm in ALARM state
- Notification received
- No obvious pipeline failure

**Response Procedure**:

1. **Identify alarm** (< 2 minutes):
   ```bash
   # Get alarm details
   aws cloudwatch describe-alarms \
     --alarm-names <alarm-name> \
     --query 'MetricAlarms[0].[StateReason,StateUpdatedTimestamp]'
   ```

2. **Check metric data** (< 5 minutes):
   ```bash
   # Get recent metric values
   aws cloudwatch get-metric-statistics \
     --namespace <namespace> \
     --metric-name <metric-name> \
     --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Average,Maximum,Minimum
   ```

3. **Correlate with events** (< 10 minutes):
   ```bash
   # Check recent deployments
   aws dynamodb query \
     --table-name kiro-pipeline-{env}-deployments \
     --index-name EnvironmentStatusIndex \
     --key-condition-expression "environment = :env" \
     --expression-attribute-values '{":env":{"S":"{env}"}}' \
     --limit 5 \
     --scan-index-forward false
   
   # Check pipeline executions
   aws codepipeline list-pipeline-executions \
     --pipeline-name kiro-pipeline-{env} \
     --max-results 5
   
   # Check application logs
   aws logs filter-log-events \
     --log-group-name /aws/codebuild/kiro-pipeline-{env}-build \
     --start-time $(date -u -d '1 hour ago' +%s)000 \
     --filter-pattern "ERROR"
   ```

4. **Determine if false positive**:
   
   **True Positive** (real issue):
   - Metric consistently above threshold
   - Correlates with known event (deployment, code change)
   - Application showing symptoms
   - **Action**: Investigate root cause, follow appropriate incident procedure
   
   **False Positive** (alarm misconfiguration):
   - Metric spike was transient
   - No correlation with events
   - Application healthy
   - **Action**: Adjust alarm threshold, document in monitoring guide

5. **Take action**:
   
   **If true positive**:
   - Follow relevant incident procedure
   - Document findings
   - Escalate if needed
   
   **If false positive**:
   ```bash
   # Acknowledge alarm
   aws cloudwatch set-alarm-state \
     --alarm-name <alarm-name> \
     --state-value OK \
     --state-reason "False positive - transient spike"
   
   # Update threshold (if needed)
   # See Task 6: Update Alarm Thresholds
   ```

6. **Document** (< 15 minutes total):
   - Record alarm trigger time
   - Document investigation findings
   - Note any threshold adjustments
   - Update runbook if new pattern identified

**Common False Positive Causes**:
- Deployment-related temporary spikes
- Test environment noise
- Metric publishing delays
- Threshold too sensitive


### Incident 4: High Deployment Duration

**Severity**: Low to Medium

**Symptoms**:
- Deployment taking >60 minutes
- Alarm: kiro-pipeline-{env}-duration in ALARM state
- Pipeline still running but slow

**Response Procedure**:

1. **Identify bottleneck** (< 5 minutes):
   ```bash
   # Get current pipeline state
   aws codepipeline get-pipeline-state \
     --name kiro-pipeline-{env} \
     --query 'stageStates[*].[stageName,latestExecution.status,actionStates[0].latestExecution.lastStatusChange]'
   
   # Identify which stage is slow
   ```

2. **Check stage-specific logs** (< 10 minutes):
   ```bash
   # For build stage
   aws logs tail /aws/codebuild/kiro-pipeline-{env}-build --since 1h
   
   # For test stages
   aws logs tail /aws/codebuild/kiro-pipeline-{env}-integration-test --since 1h
   
   # Look for:
   # - Slow test execution
   # - Network timeouts
   # - Resource constraints
   # - Large artifact uploads
   ```

3. **Analyze performance**:
   
   **Build Stage Slow**:
   - Check npm install duration
   - Verify cache is working
   - Check TypeScript compilation time
   - Review security scan duration
   
   **Test Stage Slow**:
   - Identify slow tests
   - Check for test timeouts
   - Verify test parallelization
   - Review integration test setup time
   
   **Deploy Stage Slow**:
   - Check CDK synthesis time
   - Verify CloudFormation stack updates
   - Check for resource creation delays
   - Review health check duration

4. **Immediate mitigation**:
   
   **If acceptable to wait**:
   - Let pipeline complete
   - Investigate optimization after completion
   
   **If unacceptable delay**:
   ```bash
   # Stop current execution
   aws codepipeline stop-pipeline-execution \
     --pipeline-name kiro-pipeline-{env} \
     --pipeline-execution-id <execution-id> \
     --abandon \
     --reason "Excessive duration - investigating performance issue"
   ```

5. **Optimization actions**:
   
   **Cache Issues**:
   ```bash
   # Verify cache configuration in buildspec
   # Check cache size
   aws s3 ls s3://kiro-pipeline-{env}-artifacts/cache/ --recursive --human-readable
   
   # Clear cache if corrupted
   aws s3 rm s3://kiro-pipeline-{env}-artifacts/cache/ --recursive
   ```
   
   **Slow Tests**:
   ```bash
   # Identify slow tests locally
   npm run test:coverage -- --reporter=verbose
   
   # Optimize or parallelize slow tests
   # Consider splitting test suites
   ```
   
   **Resource Constraints**:
   ```bash
   # Check CodeBuild compute size
   aws codebuild batch-get-projects \
     --names kiro-pipeline-{env}-build \
     --query 'projects[0].environment.computeType'
   
   # Consider upgrading to MEDIUM or LARGE if needed
   ```

6. **Long-term optimization**:
   - Profile test execution
   - Optimize build process
   - Review caching strategy
   - Consider parallel stage execution
   - Upgrade CodeBuild compute if needed

**Performance Targets**:
- Build stage: < 10 minutes
- Test stages: < 15 minutes each
- Deploy stages: < 15 minutes each
- Total pipeline: < 60 minutes


### Incident 5: Security Scan Failure

**Severity**: Medium to High

**Symptoms**:
- Build stage fails with security scan error
- cfn-guard or cfn-lint violations
- npm audit finds critical vulnerabilities
- Deployment blocked

**Response Procedure**:

1. **Identify security issue** (< 5 minutes):
   ```bash
   # Check build logs
   aws logs filter-log-events \
     --log-group-name /aws/codebuild/kiro-pipeline-{env}-build \
     --start-time $(date -u -d '1 hour ago' +%s)000 \
     --filter-pattern "security"
   
   # Look for:
   # - cfn-guard violations
   # - cfn-lint errors
   # - npm audit CRITICAL or HIGH vulnerabilities
   ```

2. **Assess severity**:
   
   **Critical/High Severity**:
   - Blocks deployment (correct behavior)
   - Requires immediate fix
   - May need emergency patch
   
   **Medium/Low Severity**:
   - May be acceptable risk
   - Can be addressed in next sprint
   - Document and track

3. **Remediation by type**:
   
   **cfn-guard Violations**:
   ```bash
   # Review violation details
   # Example: S3 bucket without encryption
   
   # Fix in CDK code
   # infrastructure/lib/stacks/cd-pipeline-core-stack.ts
   const bucket = new s3.Bucket(this, 'Bucket', {
     encryption: s3.BucketEncryption.KMS,  // Add encryption
     encryptionKey: kmsKey
   });
   
   # Commit and push
   git commit -m "fix: add S3 bucket encryption"
   git push origin main
   ```
   
   **cfn-lint Errors**:
   ```bash
   # Review error details
   # Example: Invalid resource property
   
   # Fix in CDK code
   # Correct the property or remove invalid configuration
   
   # Test locally
   cd infrastructure
   cdk synth
   cfn-lint cdk.out/**/*.template.json
   
   # Commit and push
   git commit -m "fix: correct CloudFormation template"
   git push origin main
   ```
   
   **npm audit Vulnerabilities**:
   ```bash
   # Review vulnerability details
   npm audit
   
   # Update vulnerable packages
   npm audit fix
   
   # If auto-fix not available
   npm update <package-name>
   
   # If no fix available, assess risk
   # Option 1: Accept risk and document
   # Option 2: Find alternative package
   # Option 3: Wait for security patch
   
   # Test after updates
   npm test
   
   # Commit and push
   git commit -m "fix: update dependencies to resolve security vulnerabilities"
   git push origin main
   ```

4. **Emergency bypass** (use with extreme caution):
   
   **Only if**:
   - Critical production issue requires immediate deployment
   - Security issue is false positive
   - Risk has been assessed and accepted by security team
   
   ```bash
   # Temporarily disable security scan (NOT RECOMMENDED)
   # Edit buildspec-build.yml
   # Comment out security scan commands
   
   # OR add to allowlist
   # For npm audit: .npmauditignore
   # For cfn-guard: Update security-rules.guard
   
   # Deploy with bypass
   git commit -m "temp: bypass security scan for emergency deployment"
   git push origin main
   
   # MUST create ticket to fix properly
   # MUST re-enable security scan after emergency
   ```

5. **Post-remediation**:
   - Verify security scan passes
   - Document vulnerability and fix
   - Update security documentation if needed
   - Review security scan configuration

**Prevention**:
- Regular dependency updates
- Security scan in local development
- Pre-commit hooks for security checks
- Security training for team


## Escalation Paths

### Escalation Levels

#### Level 1: On-Call Engineer (First Responder)

**Responsibilities**:
- Initial incident response
- Triage and assessment
- Execute standard procedures
- Escalate if needed

**Response Time**: < 15 minutes

**Escalation Criteria**:
- Cannot resolve within 30 minutes
- Production impact
- Rollback failure
- Security incident
- Multiple simultaneous failures

**Contact**:
- PagerDuty: Primary on-call rotation
- Slack: #devops-pipeline
- Email: on-call@example.com

#### Level 2: Engineering Manager

**Responsibilities**:
- Complex incident coordination
- Resource allocation
- Decision making for production changes
- Communication with stakeholders

**Response Time**: < 30 minutes

**Escalation Criteria**:
- Production outage
- Rollback failure
- Data loss risk
- Security breach
- Requires emergency maintenance window

**Contact**:
- Phone: +1-555-0100
- Slack: @engineering-manager
- Email: eng-manager@example.com

#### Level 3: CTO / VP Engineering

**Responsibilities**:
- Critical incident management
- Executive decision making
- External communication
- Post-mortem oversight

**Response Time**: < 1 hour

**Escalation Criteria**:
- Extended production outage (>2 hours)
- Data breach or security incident
- Regulatory compliance issue
- Major customer impact
- Requires executive approval

**Contact**:
- Phone: +1-555-0001
- Email: cto@example.com

### Escalation Decision Tree

```
Incident Detected
    │
    ├─ Can resolve in 15 min? ──YES──> Resolve, Document
    │                           
    └─ NO
        │
        ├─ Production impacted? ──YES──> Escalate to Level 2
        │                               
        └─ NO
            │
            ├─ Rollback failed? ──YES──> Escalate to Level 2 (URGENT)
            │                           
            └─ NO
                │
                ├─ Security issue? ──YES──> Escalate to Level 2 + Security Team
                │                          
                └─ NO
                    │
                    └─ Continue investigation, escalate if >30 min
```

### Escalation Communication Template

**Subject**: [SEVERITY] CD Pipeline Incident - {Environment} - {Brief Description}

**Body**:
```
INCIDENT SUMMARY
- Environment: {test/staging/production}
- Severity: {Low/Medium/High/Critical}
- Start Time: {timestamp}
- Current Status: {investigating/mitigating/resolved}

IMPACT
- User Impact: {none/degraded/down}
- Affected Services: {list}
- Estimated Users Affected: {number}

ACTIONS TAKEN
1. {action 1}
2. {action 2}
3. {action 3}

CURRENT SITUATION
{brief description of current state}

NEXT STEPS
{planned actions}

ESCALATION REASON
{why escalating}

RESPONDER
{your name and contact}
```


## Emergency Contacts

### Primary Contacts

#### DevOps Team

**Purpose**: First line of support for pipeline issues

**Contact Methods**:
- Slack: #devops-pipeline
- Email: devops-team@example.com
- PagerDuty: DevOps On-Call rotation

**Coverage**: 24/7

**Response Time**: < 15 minutes

#### Engineering Manager

**Name**: Jane Smith

**Contact Methods**:
- Phone: +1-555-0100
- Slack: @jane-smith
- Email: jane.smith@example.com

**Coverage**: Business hours + on-call escalation

**Response Time**: < 30 minutes

#### Security Team

**Purpose**: Security incident response

**Contact Methods**:
- Slack: #security-incidents
- Email: security@example.com
- Phone: +1-555-0200

**Coverage**: 24/7

**Response Time**: < 30 minutes for critical issues

### Secondary Contacts

#### AWS Support

**Purpose**: AWS service issues

**Contact Methods**:
- AWS Support Console
- Phone: Enterprise Support hotline
- Email: Via support case

**Coverage**: 24/7 (Enterprise Support)

**Response Time**: < 15 minutes for critical issues

#### GitHub Support

**Purpose**: GitHub service issues

**Contact Methods**:
- GitHub Support Portal
- Email: support@github.com

**Coverage**: 24/7 (Enterprise)

**Response Time**: < 1 hour for critical issues

### On-Call Rotation

#### Current On-Call Schedule

**Week of 2026-01-27**:
- Primary: John Doe (john.doe@example.com, +1-555-0101)
- Secondary: Alice Johnson (alice.johnson@example.com, +1-555-0102)

**Week of 2026-02-03**:
- Primary: Bob Wilson (bob.wilson@example.com, +1-555-0103)
- Secondary: Carol Martinez (carol.martinez@example.com, +1-555-0104)

**Access Schedule**:
- PagerDuty: https://example.pagerduty.com/schedules
- Google Calendar: DevOps On-Call Calendar

#### On-Call Responsibilities

**Primary On-Call**:
- Respond to all alerts within 15 minutes
- Triage and resolve incidents
- Escalate when necessary
- Document all incidents

**Secondary On-Call**:
- Backup for primary
- Respond if primary unavailable
- Assist with complex incidents

### Communication Channels

#### Slack Channels

- **#devops-pipeline**: General pipeline discussions and alerts
- **#incidents**: Active incident coordination
- **#deployments**: Deployment notifications
- **#security-incidents**: Security-related issues

#### Email Distribution Lists

- **devops-team@example.com**: DevOps team
- **engineering-all@example.com**: All engineering
- **on-call@example.com**: Current on-call engineers
- **security@example.com**: Security team

#### Status Page

**URL**: https://status.example.com

**Purpose**: Public status updates for major incidents

**Update Frequency**: Every 30 minutes during incidents


## Appendix

### Quick Reference Commands

#### Pipeline Status
```bash
# Get pipeline state
aws codepipeline get-pipeline-state --name kiro-pipeline-{env}

# List recent executions
aws codepipeline list-pipeline-executions --pipeline-name kiro-pipeline-{env} --max-results 5

# Get execution details
aws codepipeline get-pipeline-execution --pipeline-name kiro-pipeline-{env} --pipeline-execution-id {id}
```

#### Logs
```bash
# Tail logs
aws logs tail /aws/codebuild/kiro-pipeline-{env}-build --follow

# Search for errors
aws logs filter-log-events --log-group-name /aws/codebuild/kiro-pipeline-{env}-build --filter-pattern "ERROR"
```

#### Deployments
```bash
# Query recent deployments
aws dynamodb query --table-name kiro-pipeline-{env}-deployments --index-name EnvironmentStatusIndex --key-condition-expression "environment = :env" --expression-attribute-values '{":env":{"S":"{env}"}}' --limit 5 --scan-index-forward false

# Get specific deployment
aws dynamodb get-item --table-name kiro-pipeline-{env}-deployments --key '{"deploymentId":{"S":"{env}#{timestamp}"}}'
```

#### Alarms
```bash
# List alarms
aws cloudwatch describe-alarms --alarm-name-prefix kiro-pipeline-{env}

# Get alarm state
aws cloudwatch describe-alarms --alarm-names kiro-pipeline-{env}-failures

# Set alarm state (testing)
aws cloudwatch set-alarm-state --alarm-name kiro-pipeline-{env}-failures --state-value ALARM --state-reason "Testing"
```

#### Metrics
```bash
# Get metric statistics
aws cloudwatch get-metric-statistics --namespace KiroPipeline --metric-name DeploymentDuration --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) --end-time $(date -u +%Y-%m-%dT%H:%M:%S) --period 300 --statistics Average
```

### Severity Definitions

| Severity | Definition | Response Time | Examples |
|----------|------------|---------------|----------|
| **Critical** | Production down or data loss | < 15 minutes | Rollback failure, production outage, security breach |
| **High** | Production degraded or at risk | < 30 minutes | Pipeline failure in production, high error rate |
| **Medium** | Non-production impact or potential issue | < 1 hour | Staging failure, slow deployments, alarm investigation |
| **Low** | Informational or minor issue | < 4 hours | Test environment issues, documentation updates |

### Post-Incident Checklist

After resolving any incident:

- [ ] Document incident in incident log
- [ ] Update deployment record in DynamoDB
- [ ] Verify all alarms returned to OK state
- [ ] Notify stakeholders of resolution
- [ ] Schedule post-mortem (if High or Critical severity)
- [ ] Create tickets for follow-up actions
- [ ] Update runbook if new procedures identified
- [ ] Update monitoring if false positive/negative
- [ ] Review and improve prevention measures

### Useful Links

- **AWS Console**: https://console.aws.amazon.com
- **CloudWatch Dashboard**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=kiro-pipeline-{env}-dashboard
- **CodePipeline Console**: https://console.aws.amazon.com/codesuite/codepipeline/pipelines
- **GitHub Repository**: https://github.com/organization/kiro-codebuild-worker
- **Monitoring Guide**: [cd-pipeline-monitoring.md](./cd-pipeline-monitoring.md)
- **Deployment Guide**: [cd-pipeline-deployment.md](../deployment/cd-pipeline-deployment.md)
- **Rollback Guide**: [cd-pipeline-rollback.md](../deployment/cd-pipeline-rollback.md)

## Summary

This runbook provides comprehensive operational procedures for:

✅ **Common Tasks**: Trigger deployment, approve production, check status, view logs, update alarms, query history
✅ **Incident Response**: Pipeline failure, rollback failure, alarm investigation, high duration, security scan failure
✅ **Escalation**: Clear escalation paths with contact information and decision tree
✅ **Emergency Contacts**: On-call rotation, team contacts, communication channels

For monitoring and metrics interpretation, see the [CD Pipeline Monitoring Guide](./cd-pipeline-monitoring.md).

## Feedback and Updates

This runbook is a living document. Please contribute improvements:

- **Slack**: #devops-pipeline
- **Email**: devops-team@example.com
- **GitHub**: Create PR with updates

---

**Last Updated**: 2026-01-27
**Version**: 1.0.0
**Maintained By**: DevOps Team
**Review Frequency**: Quarterly
