# Kiro CodeBuild Worker - Infrastructure

This directory contains AWS CDK infrastructure code for the Kiro CodeBuild Worker system.

## Overview

The infrastructure is organized into modular CDK stacks that can be deployed independently or together. Each stack has a specific responsibility and follows AWS CDK best practices.

## Project Structure

```
infrastructure/
├── bin/                      # CDK app entry points
│   └── kiro-worker.ts       # Main CDK app
├── lib/
│   ├── stacks/              # CDK stack definitions
│   │   ├── core-infrastructure-stack.ts
│   │   ├── secrets-configuration-stack.ts
│   │   ├── work-item-poller-stack.ts
│   │   ├── codebuild-projects-stack.ts
│   │   └── monitoring-alerting-stack.ts
│   ├── constructs/          # Reusable CDK constructs
│   │   ├── codebuild-project-construct.ts
│   │   ├── lambda-function-construct.ts
│   │   └── monitoring-construct.ts
│   └── config/              # Environment configurations
│       ├── environments.ts
│       └── constants.ts
├── test/                    # Infrastructure tests
│   └── stacks/
├── cdk.json                 # CDK configuration
├── tsconfig.json            # TypeScript configuration
├── vitest.config.ts         # Test configuration
└── package.json             # Dependencies

```

## Prerequisites

- Node.js 18+
- npm
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Installation

```bash
cd infrastructure
npm install
```

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## CDK Commands

### Synthesize CloudFormation Templates

```bash
npm run synth

# Or with environment context
npm run synth -- --context environment=test
```

### Deploy Stacks

```bash
# Deploy all stacks
npm run deploy -- --all --context environment=test

# Deploy specific stack
npm run deploy -- KiroWorkerCore --context environment=test
```

### Show Differences

```bash
npm run diff -- --context environment=test
```

### Destroy Stacks

```bash
npm run destroy -- --all --context environment=test
```

## Environments

The infrastructure supports three environments:

- **test**: Development and testing environment
- **staging**: Pre-production environment
- **production**: Production environment

Each environment has its own configuration in `lib/config/environments.ts`.

## Stack Dependencies

Stacks should be deployed in the following order:

1. **CoreInfrastructureStack**: S3 buckets, DynamoDB tables, CloudWatch Log Groups
2. **SecretsConfigurationStack**: Secrets Manager secrets, Parameter Store parameters
3. **WorkItemPollerStack**: Lambda function and EventBridge scheduled rule
4. **CodeBuildProjectsStack**: CodeBuild projects for each environment
5. **MonitoringAlertingStack**: CloudWatch Alarms and SNS topics

## Testing

All infrastructure code must have comprehensive tests:

- Snapshot tests for CloudFormation templates
- Fine-grained assertions for specific resources
- Minimum 80% code coverage required

Example test:

```typescript
import { Template } from 'aws-cdk-lib/assertions';
import { CoreInfrastructureStack } from '../lib/stacks/core-infrastructure-stack';

describe('CoreInfrastructureStack', () => {
  it('should create S3 bucket with encryption', () => {
    const app = new cdk.App();
    const stack = new CoreInfrastructureStack(app, 'TestStack', {
      environment: 'test'
    });
    
    const template = Template.fromStack(stack);
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
});
```

## Security

- All resources use encryption at rest
- IAM roles follow least-privilege principle
- Secrets stored in AWS Secrets Manager
- No hardcoded credentials in code

## Cost Optimization

- Use appropriate compute sizes (start with SMALL)
- Implement lifecycle policies for S3
- Use on-demand billing for DynamoDB
- Set appropriate CloudWatch log retention

## Troubleshooting

### CDK Bootstrap

If you encounter bootstrap errors, run:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Permission Errors

Ensure your AWS credentials have the necessary permissions. See `docs/deployment/iam-permissions.md` for required permissions.

### Stack Dependencies

If deployment fails due to missing dependencies, deploy stacks in the correct order (see Stack Dependencies section above).

## Documentation

- [Deployment Guide](../docs/deployment/DEPLOYMENT.md)
- [IAM Permissions](../docs/deployment/iam-permissions.md)
- [Troubleshooting](../docs/deployment/troubleshooting.md)
- [AWS CDK Standards](../.kiro/steering/aws-cdk-standards.md)

## Contributing

Follow the AWS CDK standards defined in `.kiro/steering/aws-cdk-standards.md`:

- Single responsibility per stack
- Use constructs for reusable components
- Apply least privilege IAM permissions
- Enable encryption for all resources
- Write tests for all infrastructure code
- Use environment-specific configuration

## License

See LICENSE file in the root directory.
