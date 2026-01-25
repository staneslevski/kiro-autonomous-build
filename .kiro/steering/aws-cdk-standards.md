# AWS CDK Standards

## Overview

This document defines standards for AWS CDK infrastructure code in TypeScript for the Kiro CodeBuild Worker project.

## CDK Project Structure

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
│   │   ├── monitoring-alerting-stack.ts
│   │   └── kiro-power-stack.ts
│   ├── constructs/
│   │   ├── codebuild-project-construct.ts
│   │   ├── lambda-function-construct.ts
│   │   └── monitoring-construct.ts
│   └── config/
│       ├── environments.ts
│       └── constants.ts
├── test/
│   └── stacks/
│       ├── core-infrastructure-stack.test.ts
│       └── ...
├── cdk.json
├── tsconfig.json
└── package.json
```

## CDK Configuration

### cdk.json

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/kiro-worker.ts",
  "context": {
    "@aws-cdk/core:enableStackNameDuplicates": false,
    "@aws-cdk/core:stackRelativeExports": true
  }
}
```

### tsconfig.json for CDK

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["bin/**/*", "lib/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

## Stack Design Principles

### 1. Single Responsibility

Each stack should have a clear, focused purpose:

```typescript
// Good - focused stack
export class CoreInfrastructureStack extends Stack {
  public readonly artifactsBucket: s3.Bucket;
  public readonly logGroup: logs.LogGroup;
  public readonly locksTable: dynamodb.Table;
  
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    
    this.artifactsBucket = this.createArtifactsBucket();
    this.logGroup = this.createLogGroup();
    this.locksTable = this.createLocksTable();
  }
}

// Bad - doing too much
export class EverythingStack extends Stack {
  // S3, DynamoDB, Lambda, CodeBuild, Monitoring all in one stack
}
```

### 2. Use Constructs for Reusable Components

```typescript
// lib/constructs/codebuild-project-construct.ts
export interface CodeBuildProjectProps {
  projectName: string;
  environment: string;
  buildSpec: string;
  artifactsBucket: s3.IBucket;
  role: iam.IRole;
}

export class CodeBuildProjectConstruct extends Construct {
  public readonly project: codebuild.Project;
  
  constructor(scope: Construct, id: string, props: CodeBuildProjectProps) {
    super(scope, id);
    
    this.project = new codebuild.Project(this, 'Project', {
      projectName: props.projectName,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        environmentVariables: {
          ENVIRONMENT: { value: props.environment }
        }
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(props.buildSpec),
      artifacts: codebuild.Artifacts.s3({
        bucket: props.artifactsBucket,
        includeBuildId: true,
        packageZip: false
      }),
      role: props.role
    });
  }
}
```

### 3. Environment Configuration

```typescript
// lib/config/environments.ts
export interface EnvironmentConfig {
  account: string;
  region: string;
  environment: 'test' | 'staging' | 'production';
  vpcId?: string;
  coverageThreshold: number;
  pollingInterval: string;
}

export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  test: {
    account: process.env.CDK_DEFAULT_ACCOUNT!,
    region: 'us-east-1',
    environment: 'test',
    coverageThreshold: 80,
    pollingInterval: 'rate(5 minutes)'
  },
  staging: {
    account: process.env.CDK_DEFAULT_ACCOUNT!,
    region: 'us-east-1',
    environment: 'staging',
    coverageThreshold: 80,
    pollingInterval: 'rate(10 minutes)'
  },
  production: {
    account: process.env.CDK_DEFAULT_ACCOUNT!,
    region: 'us-east-1',
    environment: 'production',
    coverageThreshold: 80,
    pollingInterval: 'rate(15 minutes)'
  }
};
```

### 4. Stack Dependencies

```typescript
// bin/kiro-worker.ts
const app = new cdk.App();
const env = app.node.tryGetContext('environment') || 'test';
const config = ENVIRONMENTS[env];

// Stack 1: Core Infrastructure
const coreStack = new CoreInfrastructureStack(app, 'KiroWorkerCore', {
  env: { account: config.account, region: config.region },
  environment: config.environment
});

// Stack 2: Secrets (depends on Core)
const secretsStack = new SecretsConfigurationStack(app, 'KiroWorkerSecrets', {
  env: { account: config.account, region: config.region },
  kmsKey: coreStack.kmsKey
});

// Stack 3: Work Item Poller (depends on Core and Secrets)
const pollerStack = new WorkItemPollerStack(app, 'KiroWorkerPoller', {
  env: { account: config.account, region: config.region },
  locksTable: coreStack.locksTable,
  secretsArn: secretsStack.githubTokenSecret.secretArn,
  pollingInterval: config.pollingInterval
});
```

## Resource Naming

### Naming Convention

```typescript
// Pattern: {Project}-{Environment}-{Resource}-{Purpose}
const bucketName = `kiro-worker-${environment}-artifacts`;
const tableName = `kiro-worker-${environment}-locks`;
const functionName = `kiro-worker-${environment}-poller`;
```

### Use CDK IDs Consistently

```typescript
// Good - descriptive IDs
new s3.Bucket(this, 'ArtifactsBucket', { ... });
new dynamodb.Table(this, 'LocksTable', { ... });
new lambda.Function(this, 'PollerFunction', { ... });

// Bad - generic IDs
new s3.Bucket(this, 'Bucket1', { ... });
new dynamodb.Table(this, 'Table', { ... });
```

## IAM Permissions

### Least Privilege Principle

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

### Grant Methods

```typescript
// Prefer grant methods over manual policies
artifactsBucket.grantReadWrite(codeBuildRole);
locksTable.grantReadWriteData(lambdaRole);
secret.grantRead(codeBuildRole);
```

## Resource Configuration

### S3 Buckets

```typescript
const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
  bucketName: `kiro-worker-${environment}-artifacts`,
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  lifecycleRules: [
    {
      id: 'DeleteOldArtifacts',
      expiration: cdk.Duration.days(90),
      noncurrentVersionExpiration: cdk.Duration.days(30)
    }
  ]
});
```

### DynamoDB Tables

```typescript
const locksTable = new dynamodb.Table(this, 'LocksTable', {
  tableName: `kiro-worker-${environment}-locks`,
  partitionKey: {
    name: 'lockKey',
    type: dynamodb.AttributeType.STRING
  },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
  pointInTimeRecovery: environment === 'production',
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  timeToLiveAttribute: 'expiresAt'
});
```

### Lambda Functions

```typescript
const pollerFunction = new lambda.Function(this, 'PollerFunction', {
  functionName: `kiro-worker-${environment}-poller`,
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('dist/lambda'),
  timeout: cdk.Duration.minutes(15),
  memorySize: 512,
  environment: {
    ENVIRONMENT: environment,
    LOCKS_TABLE_NAME: locksTable.tableName,
    GITHUB_TOKEN_SECRET_ARN: githubTokenSecret.secretArn
  },
  deadLetterQueue: dlq,
  retryAttempts: 0 // Handle retries in code
});
```

### CodeBuild Projects

```typescript
const project = new codebuild.Project(this, 'WorkerProject', {
  projectName: `kiro-worker-${environment}`,
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    computeType: codebuild.ComputeType.SMALL,
    privileged: false,
    environmentVariables: {
      ENVIRONMENT: { value: environment },
      COVERAGE_THRESHOLD: { value: '80' }
    }
  },
  buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
  timeout: cdk.Duration.minutes(60),
  queuedTimeout: cdk.Duration.hours(8),
  cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
  logging: {
    cloudWatch: {
      logGroup: logGroup,
      enabled: true
    }
  }
});
```

## Monitoring and Alarms

### CloudWatch Alarms

```typescript
const buildFailureAlarm = new cloudwatch.Alarm(this, 'BuildFailureAlarm', {
  alarmName: `kiro-worker-${environment}-build-failures`,
  metric: project.metricFailedBuilds({
    statistic: 'Sum',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 3,
  evaluationPeriods: 1,
  datapointsToAlarm: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});

buildFailureAlarm.addAlarmAction(new actions.SnsAction(alertTopic));
```

### SNS Topics

```typescript
const alertTopic = new sns.Topic(this, 'AlertTopic', {
  topicName: `kiro-worker-${environment}-alerts`,
  displayName: `Kiro Worker ${environment} Alerts`
});

// Add email subscription
alertTopic.addSubscription(
  new subscriptions.EmailSubscription('ops-team@example.com')
);
```

## Testing CDK Stacks

### Snapshot Tests

```typescript
import { Template } from 'aws-cdk-lib/assertions';
import { CoreInfrastructureStack } from '../lib/stacks/core-infrastructure-stack';

describe('CoreInfrastructureStack', () => {
  it('should match snapshot', () => {
    const app = new cdk.App();
    const stack = new CoreInfrastructureStack(app, 'TestStack', {
      environment: 'test'
    });
    
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
```

### Fine-Grained Assertions

```typescript
import { Template, Match } from 'aws-cdk-lib/assertions';

describe('CoreInfrastructureStack', () => {
  let template: Template;
  
  beforeEach(() => {
    const app = new cdk.App();
    const stack = new CoreInfrastructureStack(app, 'TestStack', {
      environment: 'test'
    });
    template = Template.fromStack(stack);
  });
  
  it('should create S3 bucket with encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256'
            }
          }
        ]
      }
    });
  });
  
  it('should create DynamoDB table with TTL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'kiro-worker-test-locks',
      TimeToLiveSpecification: {
        AttributeName: 'expiresAt',
        Enabled: true
      }
    });
  });
  
  it('should create exactly one Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
  });
});
```

## Deployment Best Practices

### Use CDK Context

```bash
# Deploy to specific environment
cdk deploy --context environment=test

# Deploy all stacks
cdk deploy --all --context environment=production

# Synthesize without deploying
cdk synth --context environment=staging
```

### Stack Outputs

```typescript
export class CoreInfrastructureStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    
    const bucket = new s3.Bucket(this, 'ArtifactsBucket', { ... });
    
    // Export for cross-stack references
    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: bucket.bucketName,
      description: 'Name of the artifacts S3 bucket',
      exportName: `kiro-worker-${environment}-artifacts-bucket`
    });
  }
}
```

### Tags

```typescript
// Apply tags to all resources in stack
cdk.Tags.of(this).add('Project', 'KiroWorker');
cdk.Tags.of(this).add('Environment', environment);
cdk.Tags.of(this).add('ManagedBy', 'CDK');
```

## Security Best Practices

### Secrets Management

```typescript
// Never hardcode secrets
// Bad
const secret = new secretsmanager.Secret(this, 'GitHubToken', {
  secretStringValue: cdk.SecretValue.unsafePlainText('ghp_token123')
});

// Good - use placeholder, populate manually
const secret = new secretsmanager.Secret(this, 'GitHubToken', {
  secretName: `kiro-worker-${environment}-github-token`,
  description: 'GitHub API token for Kiro Worker'
});

new cdk.CfnOutput(this, 'GitHubTokenSecretArn', {
  value: secret.secretArn,
  description: 'Populate this secret with GitHub token after deployment'
});
```

### Encryption

```typescript
// Always enable encryption
const bucket = new s3.Bucket(this, 'Bucket', {
  encryption: s3.BucketEncryption.S3_MANAGED // or KMS_MANAGED
});

const table = new dynamodb.Table(this, 'Table', {
  encryption: dynamodb.TableEncryption.AWS_MANAGED
});

const logGroup = new logs.LogGroup(this, 'LogGroup', {
  encryption: logs.LogGroupEncryption.KMS,
  encryptionKey: kmsKey
});
```

### Network Security

```typescript
// Use VPC when needed
const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
  vpcId: config.vpcId
});

const project = new codebuild.Project(this, 'Project', {
  vpc,
  subnetSelection: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
  },
  securityGroups: [securityGroup]
});
```

## Cost Optimization

### Use Appropriate Compute Sizes

```typescript
// Start with small, scale up if needed
const project = new codebuild.Project(this, 'Project', {
  environment: {
    computeType: codebuild.ComputeType.SMALL // 3 GB, 2 vCPUs
  }
});
```

### Lifecycle Policies

```typescript
const bucket = new s3.Bucket(this, 'Bucket', {
  lifecycleRules: [
    {
      id: 'DeleteOldArtifacts',
      expiration: cdk.Duration.days(90)
    },
    {
      id: 'TransitionToIA',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: cdk.Duration.days(30)
        }
      ]
    }
  ]
});
```

### On-Demand vs Provisioned

```typescript
// Use on-demand for variable workloads
const table = new dynamodb.Table(this, 'Table', {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
});

// Use provisioned for predictable workloads
const table = new dynamodb.Table(this, 'Table', {
  billingMode: dynamodb.BillingMode.PROVISIONED,
  readCapacity: 5,
  writeCapacity: 5
});
```

## Summary

- Organize stacks by responsibility
- Use constructs for reusable components
- Follow naming conventions consistently
- Apply least privilege IAM permissions
- Enable encryption for all resources
- Write tests for infrastructure code
- Use environment-specific configuration
- Tag all resources appropriately
- Optimize for cost and performance
- Document stack outputs and dependencies
