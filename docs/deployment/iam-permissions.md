# IAM Permissions Guide

This document details the IAM permissions required for deploying and operating the Kiro CodeBuild Worker system.

## Table of Contents

1. [Overview](#overview)
2. [Deployment Permissions](#deployment-permissions)
3. [Runtime Permissions](#runtime-permissions)
4. [Sample IAM Policies](#sample-iam-policies)
5. [Least-Privilege Principles](#least-privilege-principles)
6. [Permission Validation](#permission-validation)
7. [Troubleshooting](#troubleshooting)

## Overview

The Kiro CodeBuild Worker requires two sets of permissions:

1. **Deployment Permissions**: Required by the user/role deploying the CDK stacks
2. **Runtime Permissions**: Required by the system components (CodeBuild, Lambda) during operation

### Permission Separation

For security best practices:
- Use separate IAM users/roles for deployment vs. runtime
- Deployment permissions are broader (create/update infrastructure)
- Runtime permissions are narrower (execute specific operations)
- Never use AdministratorAccess in production

## Deployment Permissions

### Required Services

The deployment user/role needs permissions to create and manage:

- AWS CloudFormation (stacks, change sets)
- AWS IAM (roles, policies)
- Amazon S3 (buckets, objects)
- Amazon DynamoDB (tables)
- AWS Lambda (functions, event source mappings)
- AWS CodeBuild (projects)
- AWS Secrets Manager (secrets)
- AWS Systems Manager Parameter Store (parameters)
- AWS KMS (keys, aliases)
- Amazon EventBridge (rules, targets)
- Amazon CloudWatch (log groups, alarms)
- Amazon SNS (topics, subscriptions)
- Amazon SQS (queues)

### Deployment IAM Policy

**Policy Name**: `KiroWorkerDeploymentPolicy`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationAccess",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ListStacks"
      ],
      "Resource": [
        "arn:aws:cloudformation:*:*:stack/KiroWorker*/*",
        "arn:aws:cloudformation:*:*:stack/CDKToolkit/*"
      ]
    },
    {
      "Sid": "IAMAccess",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:ListPolicyVersions",
        "iam:TagRole",
        "iam:UntagRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/KiroWorker*",
        "arn:aws:iam::*:policy/KiroWorker*"
      ]
    },
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning",
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:PutLifecycleConfiguration",
        "s3:GetBucketTagging",
        "s3:PutBucketTagging",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::kiro-worker-*",
        "arn:aws:s3:::kiro-worker-*/*",
        "arn:aws:s3:::cdktoolkit-*",
        "arn:aws:s3:::cdktoolkit-*/*"
      ]
    },
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTable",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/kiro-worker-*"
    },
    {
      "Sid": "LambdaAccess",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:GetPolicy",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListTags",
        "lambda:PublishVersion",
        "lambda:CreateAlias",
        "lambda:UpdateAlias",
        "lambda:DeleteAlias"
      ],
      "Resource": "arn:aws:lambda:*:*:function:kiro-worker-*"
    },
    {
      "Sid": "CodeBuildAccess",
      "Effect": "Allow",
      "Action": [
        "codebuild:CreateProject",
        "codebuild:DeleteProject",
        "codebuild:UpdateProject",
        "codebuild:BatchGetProjects"
      ],
      "Resource": "arn:aws:codebuild:*:*:project/kiro-worker-*"
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:DeleteSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:UpdateSecret",
        "secretsmanager:TagResource",
        "secretsmanager:UntagResource"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:kiro-worker-*"
    },
    {
      "Sid": "SSMAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:PutParameter",
        "ssm:DeleteParameter",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:DescribeParameters",
        "ssm:AddTagsToResource",
        "ssm:RemoveTagsFromResource"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/kiro-worker/*"
    },
    {
      "Sid": "KMSAccess",
      "Effect": "Allow",
      "Action": [
        "kms:CreateKey",
        "kms:CreateAlias",
        "kms:DeleteAlias",
        "kms:DescribeKey",
        "kms:GetKeyPolicy",
        "kms:PutKeyPolicy",
        "kms:EnableKeyRotation",
        "kms:TagResource",
        "kms:UntagResource",
        "kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion"
      ],
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "kms:RequestAlias": "alias/kiro-worker-*"
        }
      }
    },
    {
      "Sid": "EventBridgeAccess",
      "Effect": "Allow",
      "Action": [
        "events:PutRule",
        "events:DeleteRule",
        "events:DescribeRule",
        "events:EnableRule",
        "events:DisableRule",
        "events:PutTargets",
        "events:RemoveTargets",
        "events:TagResource",
        "events:UntagResource"
      ],
      "Resource": "arn:aws:events:*:*:rule/kiro-worker-*"
    },
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:DescribeLogGroups",
        "logs:PutRetentionPolicy",
        "logs:TagLogGroup",
        "logs:UntagLogGroup"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/*/kiro-worker-*"
    },
    {
      "Sid": "CloudWatchAlarmsAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:DeleteAlarms",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:TagResource",
        "cloudwatch:UntagResource"
      ],
      "Resource": "arn:aws:cloudwatch:*:*:alarm:kiro-worker-*"
    },
    {
      "Sid": "SNSAccess",
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:DeleteTopic",
        "sns:GetTopicAttributes",
        "sns:SetTopicAttributes",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:TagResource",
        "sns:UntagResource"
      ],
      "Resource": "arn:aws:sns:*:*:kiro-worker-*"
    },
    {
      "Sid": "SQSAccess",
      "Effect": "Allow",
      "Action": [
        "sqs:CreateQueue",
        "sqs:DeleteQueue",
        "sqs:GetQueueAttributes",
        "sqs:SetQueueAttributes",
        "sqs:TagQueue",
        "sqs:UntagQueue"
      ],
      "Resource": "arn:aws:sqs:*:*:kiro-worker-*"
    },
    {
      "Sid": "STSAccess",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

### CDK Bootstrap Permissions

If you need to bootstrap CDK (first time only), add these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CDKBootstrapAccess",
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "iam:*",
        "ecr:*",
        "ssm:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudformation:StackName": "CDKToolkit"
        }
      }
    }
  ]
}
```

**Note**: CDK bootstrap requires broader permissions. Use a separate role/user for bootstrap if needed.

## Runtime Permissions

### CodeBuild IAM Role

**Role Name**: `KiroWorkerCodeBuildRole`

This role is created automatically by CDK but requires these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/codebuild/kiro-worker-*"
    },
    {
      "Sid": "S3ArtifactsAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::kiro-worker-*-artifacts/*"
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:kiro-worker-*-github-token-*",
        "arn:aws:secretsmanager:*:*:secret:kiro-worker-*-git-credentials-*"
      ]
    },
    {
      "Sid": "SSMParameterAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/kiro-worker/*"
    },
    {
      "Sid": "KMSDecryptAccess",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:*:*:key/*",
      "Condition": {
        "StringLike": {
          "kms:RequestAlias": "alias/kiro-worker-*"
        }
      }
    },
    {
      "Sid": "CodeBuildAccess",
      "Effect": "Allow",
      "Action": [
        "codebuild:CreateReportGroup",
        "codebuild:CreateReport",
        "codebuild:UpdateReport",
        "codebuild:BatchPutTestCases",
        "codebuild:BatchPutCodeCoverages"
      ],
      "Resource": "arn:aws:codebuild:*:*:report-group/kiro-worker-*"
    }
  ]
}
```

### Lambda IAM Role

**Role Name**: `KiroWorkerPollerRole`

This role is created automatically by CDK but requires these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/kiro-worker-*"
    },
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/kiro-worker-*-locks"
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:kiro-worker-*-github-token-*"
    },
    {
      "Sid": "SSMParameterAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/kiro-worker/*"
    },
    {
      "Sid": "CodeBuildAccess",
      "Effect": "Allow",
      "Action": [
        "codebuild:StartBuild",
        "codebuild:BatchGetBuilds"
      ],
      "Resource": "arn:aws:codebuild:*:*:project/kiro-worker-*"
    },
    {
      "Sid": "SQSAccess",
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:*:*:kiro-worker-*-dlq"
    },
    {
      "Sid": "KMSDecryptAccess",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:*:*:key/*",
      "Condition": {
        "StringLike": {
          "kms:RequestAlias": "alias/kiro-worker-*"
        }
      }
    }
  ]
}
```

## Sample IAM Policies

### Deployment User Policy

Create an IAM user for deployment with this policy attached:

```bash
# Create IAM user
aws iam create-user --user-name kiro-worker-deployer

# Create policy
aws iam create-policy \
  --policy-name KiroWorkerDeploymentPolicy \
  --policy-document file://deployment-policy.json

# Attach policy to user
aws iam attach-user-policy \
  --user-name kiro-worker-deployer \
  --policy-arn arn:aws:iam::123456789012:policy/KiroWorkerDeploymentPolicy

# Create access key
aws iam create-access-key --user-name kiro-worker-deployer
```

### Read-Only Monitoring Policy

For users who need to monitor but not deploy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOnlyAccess",
      "Effect": "Allow",
      "Action": [
        "cloudformation:DescribeStacks",
        "cloudformation:ListStacks",
        "codebuild:BatchGetProjects",
        "codebuild:BatchGetBuilds",
        "codebuild:ListBuildsForProject",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "dynamodb:DescribeTable",
        "s3:ListBucket",
        "s3:GetObject",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:GetMetricStatistics",
        "sns:ListTopics",
        "sns:GetTopicAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```

## Least-Privilege Principles

### Principle 1: Resource-Specific Permissions

Always scope permissions to specific resources:

**Good**:
```json
{
  "Resource": "arn:aws:s3:::kiro-worker-*"
}
```

**Bad**:
```json
{
  "Resource": "*"
}
```

### Principle 2: Action-Specific Permissions

Only grant required actions:

**Good**:
```json
{
  "Action": [
    "s3:GetObject",
    "s3:PutObject"
  ]
}
```

**Bad**:
```json
{
  "Action": "s3:*"
}
```

### Principle 3: Condition-Based Restrictions

Use conditions to further restrict access:

```json
{
  "Condition": {
    "StringEquals": {
      "aws:RequestedRegion": "us-east-1"
    }
  }
}
```

### Principle 4: Separate Deployment and Runtime

- Deployment permissions: Broader, used infrequently
- Runtime permissions: Narrower, used continuously
- Never use same credentials for both

### Principle 5: Regular Audits

- Review IAM policies quarterly
- Remove unused permissions
- Update policies as requirements change
- Use AWS IAM Access Analyzer

## Permission Validation

### Pre-Deployment Validation

Before deploying, validate permissions:

```bash
# Test CloudFormation access
aws cloudformation list-stacks

# Test IAM access
aws iam get-user

# Test S3 access
aws s3 ls

# Test Secrets Manager access
aws secretsmanager list-secrets
```

### IAM Policy Simulator

Use AWS IAM Policy Simulator to test permissions:

```bash
# Simulate CloudFormation CreateStack
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/kiro-worker-deployer \
  --action-names cloudformation:CreateStack \
  --resource-arns arn:aws:cloudformation:us-east-1:123456789012:stack/KiroWorkerCore/*
```

### Permission Validation Script

Create a script to validate all required permissions:

```bash
#!/bin/bash
# validate-permissions.sh

echo "Validating deployment permissions..."

# Test CloudFormation
aws cloudformation describe-stacks --stack-name CDKToolkit &>/dev/null
if [ $? -eq 0 ]; then
  echo "✓ CloudFormation access verified"
else
  echo "✗ CloudFormation access failed"
fi

# Test IAM
aws iam get-user &>/dev/null
if [ $? -eq 0 ]; then
  echo "✓ IAM access verified"
else
  echo "✗ IAM access failed"
fi

# Test S3
aws s3 ls &>/dev/null
if [ $? -eq 0 ]; then
  echo "✓ S3 access verified"
else
  echo "✗ S3 access failed"
fi

# Add more tests as needed...
```

## Troubleshooting

### Issue: Access Denied during deployment

**Error**:
```
User: arn:aws:iam::123456789012:user/deployer is not authorized to perform: cloudformation:CreateStack
```

**Solution**:
1. Verify IAM policy is attached to user/role
2. Check policy has required action (cloudformation:CreateStack)
3. Verify resource ARN matches stack name pattern
4. Check for deny policies in AWS Organizations SCPs

### Issue: PassRole permission denied

**Error**:
```
User is not authorized to perform: iam:PassRole on resource: arn:aws:iam::123456789012:role/KiroWorkerCodeBuildRole
```

**Solution**:
Add PassRole permission to deployment policy:
```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::*:role/KiroWorker*"
}
```

### Issue: KMS decrypt permission denied

**Error**:
```
User is not authorized to perform: kms:Decrypt
```

**Solution**:
1. Verify KMS key policy allows user/role
2. Add KMS decrypt permission to IAM policy
3. Check key alias matches condition

### Issue: Secrets Manager access denied

**Error**:
```
User is not authorized to perform: secretsmanager:GetSecretValue
```

**Solution**:
1. Verify secret exists
2. Check IAM policy has GetSecretValue action
3. Verify resource ARN matches secret name pattern
4. Check KMS key policy if secret is encrypted

### Debugging Permission Issues

Enable CloudTrail to see denied API calls:

```bash
# View recent CloudTrail events
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateStack \
  --max-results 10
```

Use IAM Access Analyzer:

```bash
# Create analyzer
aws accessanalyzer create-analyzer \
  --analyzer-name kiro-worker-analyzer \
  --type ACCOUNT

# List findings
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:us-east-1:123456789012:analyzer/kiro-worker-analyzer
```

## Security Best Practices

1. **Use IAM Roles for AWS Services**: Never use long-term credentials for Lambda or CodeBuild
2. **Enable MFA**: Require MFA for deployment users
3. **Rotate Credentials**: Rotate access keys every 90 days
4. **Use Temporary Credentials**: Use AWS STS AssumeRole for deployment
5. **Audit Regularly**: Review IAM policies and access patterns quarterly
6. **Principle of Least Privilege**: Only grant minimum required permissions
7. **Separate Environments**: Use different AWS accounts for test/staging/production
8. **Enable CloudTrail**: Log all API calls for audit trail
9. **Use IAM Access Analyzer**: Identify overly permissive policies
10. **Document Permissions**: Keep this document updated with any changes

## Permission Checklist

Before deployment, verify:

- [ ] Deployment user/role has required permissions
- [ ] IAM policies are attached correctly
- [ ] Resource ARNs match naming patterns
- [ ] Conditions are properly configured
- [ ] PassRole permission is granted
- [ ] KMS key policies allow access
- [ ] Secrets Manager permissions are granted
- [ ] CloudFormation permissions are sufficient
- [ ] CDK is bootstrapped (if first deployment)
- [ ] Permission validation tests pass

## Next Steps

After configuring permissions:

1. Proceed to [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions
2. Test permissions with validation script
3. Review CloudTrail logs after deployment
4. Set up IAM Access Analyzer for ongoing monitoring
5. Schedule quarterly permission audits
