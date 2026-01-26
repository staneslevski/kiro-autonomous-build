# Environment Configuration

This module provides environment-specific configuration for the Kiro CodeBuild Worker infrastructure deployment.

## Overview

The environment configuration defines settings for three deployment environments:
- **test**: Development and testing environment
- **staging**: Pre-production validation environment  
- **production**: Production environment

## Usage

### Basic Usage

```typescript
import { getEnvironmentConfig } from './config';

// Get configuration for a specific environment
const config = getEnvironmentConfig('test');

console.log(config.account);           // AWS account ID
console.log(config.region);            // AWS region
console.log(config.coverageThreshold); // 80
console.log(config.pollingInterval);   // "rate(5 minutes)"
```

### Accessing All Environments

```typescript
import { ENVIRONMENTS, getAvailableEnvironments } from './config';

// Get all environment configurations
const allConfigs = ENVIRONMENTS;

// Get list of available environment names
const envNames = getAvailableEnvironments(); // ['test', 'staging', 'production']
```

### Validating Configuration

```typescript
import { validateEnvironmentConfig, type EnvironmentConfig } from './config';

const customConfig: EnvironmentConfig = {
  account: '123456789012',
  region: 'us-west-2',
  environment: 'test',
  coverageThreshold: 85,
  pollingInterval: 'rate(10 minutes)',
};

// Validate configuration (throws on invalid)
validateEnvironmentConfig(customConfig);
```

## Configuration Properties

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `account` | string | AWS account ID (12 digits) |
| `region` | string | AWS region (e.g., 'us-east-1') |
| `environment` | 'test' \| 'staging' \| 'production' | Environment name |
| `coverageThreshold` | number | Minimum code coverage percentage (0-100) |
| `pollingInterval` | string | EventBridge schedule expression |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `vpcId` | string | undefined | VPC ID for CodeBuild projects |
| `codeBuildComputeType` | 'SMALL' \| 'MEDIUM' \| 'LARGE' | 'SMALL' | CodeBuild compute size |
| `codeBuildTimeout` | number | 60 | CodeBuild timeout in minutes |
| `lambdaTimeout` | number | 15 | Lambda timeout in minutes |
| `lockTTLHours` | number | 2 | DynamoDB lock TTL in hours |
| `artifactRetentionDays` | number | varies | S3 artifact retention in days |
| `logRetentionDays` | number | varies | CloudWatch log retention in days |
| `enableDetailedMetrics` | boolean | varies | Enable detailed CloudWatch metrics |
| `alertEmail` | string | undefined | Email for SNS alerts |

## Environment Defaults

### Test Environment

```typescript
{
  environment: 'test',
  region: 'us-east-1',
  coverageThreshold: 80,
  pollingInterval: 'rate(5 minutes)',
  codeBuildComputeType: 'SMALL',
  codeBuildTimeout: 60,
  lambdaTimeout: 15,
  lockTTLHours: 2,
  artifactRetentionDays: 30,
  logRetentionDays: 7,
  enableDetailedMetrics: true,
}
```

### Staging Environment

```typescript
{
  environment: 'staging',
  region: 'us-east-1',
  coverageThreshold: 80,
  pollingInterval: 'rate(10 minutes)',
  codeBuildComputeType: 'SMALL',
  codeBuildTimeout: 60,
  lambdaTimeout: 15,
  lockTTLHours: 2,
  artifactRetentionDays: 60,
  logRetentionDays: 14,
  enableDetailedMetrics: true,
}
```

### Production Environment

```typescript
{
  environment: 'production',
  region: 'us-east-1',
  coverageThreshold: 80,
  pollingInterval: 'rate(15 minutes)',
  codeBuildComputeType: 'SMALL',
  codeBuildTimeout: 60,
  lambdaTimeout: 15,
  lockTTLHours: 2,
  artifactRetentionDays: 90,
  logRetentionDays: 30,
  enableDetailedMetrics: false,
}
```

## AWS Account Configuration

The AWS account ID is read from the `CDK_DEFAULT_ACCOUNT` environment variable. Set this before deployment:

```bash
export CDK_DEFAULT_ACCOUNT=123456789012
```

Or configure it explicitly in your CDK app:

```typescript
import { getEnvironmentConfig } from './config';

const config = getEnvironmentConfig('production');

// Override account if needed
config.account = '987654321098';
```

## Validation Rules

The `validateEnvironmentConfig` function enforces:

1. **Account ID**: Must be exactly 12 digits
2. **Region**: Must not be empty
3. **Coverage Threshold**: Must be between 0 and 100
4. **Polling Interval**: Must be valid EventBridge expression
   - Rate: `rate(N minute|minutes|hour|hours|day|days)`
   - Cron: `cron(expression)`
5. **Numeric Fields**: All optional numeric fields must be positive

## Error Handling

### Invalid Environment Name

```typescript
try {
  getEnvironmentConfig('invalid');
} catch (error) {
  // Error: Invalid environment: invalid. Valid environments: test, staging, production
}
```

### Missing Account Configuration

```typescript
delete process.env.CDK_DEFAULT_ACCOUNT;

try {
  getEnvironmentConfig('test');
} catch (error) {
  // Error: AWS account not configured for environment: test.
  // Set CDK_DEFAULT_ACCOUNT environment variable or configure account explicitly.
}
```

### Invalid Configuration

```typescript
const config: EnvironmentConfig = {
  account: '12345', // Too short
  region: 'us-east-1',
  environment: 'test',
  coverageThreshold: 80,
  pollingInterval: 'rate(5 minutes)',
};

try {
  validateEnvironmentConfig(config);
} catch (error) {
  // Error: Invalid AWS account ID: 12345. Must be 12 digits.
}
```

## Testing

The configuration module has 100% test coverage with 58 test cases covering:

- Environment constant definitions
- Configuration retrieval
- Validation logic
- Edge cases
- Type safety

Run tests:

```bash
npm test -- test/config/environments.test.ts
```

Run with coverage:

```bash
npm run test:coverage -- test/config/environments.test.ts
```

## Best Practices

1. **Always validate** custom configurations before use
2. **Use environment variables** for account IDs in CI/CD
3. **Override defaults** only when necessary
4. **Test configuration changes** thoroughly
5. **Document custom settings** in deployment documentation

## See Also

- [AWS CDK Standards](../../../.kiro/steering/aws-cdk-standards.md)
- [Deployment Documentation](../../../docs/deployment/)
- [Project Overview](../../../.kiro/steering/project-overview.md)
