# TypeScript Coding Standards

## Overview

This document defines TypeScript coding standards for the Kiro CodeBuild Worker project. These standards ensure code quality, maintainability, and consistency across the codebase.

## TypeScript Configuration

### tsconfig.json Requirements

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "moduleResolution": "node"
  }
}
```

**Key Settings**:
- `strict: true` - Enable all strict type checking options
- `noUnusedLocals: true` - Prevent unused variables
- `noUnusedParameters: true` - Prevent unused function parameters
- `noImplicitReturns: true` - Ensure all code paths return a value

## Code Style

### Naming Conventions

**Interfaces and Types**:
```typescript
// Use PascalCase for interfaces and types
interface GitBranchManager {
  checkoutBranch(branchName: string): Promise<void>;
}

type ValidationResult = {
  isValid: boolean;
  errors: string[];
};
```

**Classes**:
```typescript
// Use PascalCase for class names
class KiroWorker {
  private readonly config: WorkerConfig;
  
  constructor(config: WorkerConfig) {
    this.config = config;
  }
}
```

**Functions and Variables**:
```typescript
// Use camelCase for functions and variables
const buildId = generateBuildId();
async function executePipeline(): Promise<void> {
  // Implementation
}
```

**Constants**:
```typescript
// Use UPPER_SNAKE_CASE for constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 60000;
```

**Private Members**:
```typescript
// Use private keyword and readonly when appropriate
class TestRunner {
  private readonly coverageThreshold: number;
  private testResults: TestResult[] = [];
  
  private async parseResults(): Promise<void> {
    // Implementation
  }
}
```

### Type Annotations

**Always Specify Return Types**:
```typescript
// Good
async function fetchWorkItems(): Promise<WorkItem[]> {
  return await api.getWorkItems();
}

// Bad - missing return type
async function fetchWorkItems() {
  return await api.getWorkItems();
}
```

**Use Explicit Types for Function Parameters**:
```typescript
// Good
function validateBranch(branchName: string, specPath: string): ValidationResult {
  // Implementation
}

// Bad - implicit any
function validateBranch(branchName, specPath) {
  // Implementation
}
```

**Avoid `any` Type**:
```typescript
// Good - use specific types or unknown
function processData(data: WorkItem): void {
  // Implementation
}

function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(error.message);
  }
}

// Bad - using any
function processData(data: any): void {
  // Implementation
}
```

### Async/Await

**Always Use async/await Over Promises**:
```typescript
// Good
async function executeBuild(): Promise<BuildResult> {
  const branch = await checkoutBranch();
  const tests = await runTests();
  return { branch, tests };
}

// Bad - promise chaining
function executeBuild(): Promise<BuildResult> {
  return checkoutBranch()
    .then(branch => runTests().then(tests => ({ branch, tests })));
}
```

**Handle Errors Properly**:
```typescript
// Good
async function safeFetch(): Promise<WorkItem[]> {
  try {
    return await fetchWorkItems();
  } catch (error) {
    logger.error('Failed to fetch work items', error);
    throw new WorkItemFetchError('Unable to retrieve work items', { cause: error });
  }
}
```

### Error Handling

**Use Custom Error Classes**:
```typescript
// Define custom errors
export class GitOperationError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GitOperationError';
  }
}

// Use custom errors
throw new GitOperationError('Failed to push branch', 'push', originalError);
```

**Type Guard for Error Handling**:
```typescript
function isGitOperationError(error: unknown): error is GitOperationError {
  return error instanceof GitOperationError;
}

try {
  await pushBranch();
} catch (error) {
  if (isGitOperationError(error)) {
    logger.error(`Git ${error.operation} failed: ${error.message}`);
  } else {
    logger.error('Unknown error', error);
  }
}
```

### Interfaces vs Types

**Use Interfaces for Object Shapes**:
```typescript
// Good - interface for object structure
interface WorkerConfig {
  environment: string;
  branchName: string;
  specPath: string;
}
```

**Use Types for Unions, Intersections, and Utilities**:
```typescript
// Good - type for unions
type Environment = 'test' | 'staging' | 'production';

// Good - type for intersections
type WorkItemWithMetadata = WorkItem & { metadata: BuildMetadata };

// Good - type for utility types
type PartialConfig = Partial<WorkerConfig>;
```

### Null and Undefined

**Use Strict Null Checks**:
```typescript
// Good - explicit null handling
function findWorkItem(id: string): WorkItem | null {
  const item = items.find(i => i.id === id);
  return item ?? null;
}

// Use optional chaining
const prUrl = workItem?.pullRequest?.url;

// Use nullish coalescing
const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
```

**Avoid Undefined in Return Types**:
```typescript
// Good - use null for "not found"
function getConfig(key: string): string | null {
  return configMap.get(key) ?? null;
}

// Bad - undefined is implicit
function getConfig(key: string): string | undefined {
  return configMap.get(key);
}
```

## Code Organization

### File Structure

```
src/
├── components/           # Core components
│   ├── git-branch-manager.ts
│   ├── steering-synchronizer.ts
│   ├── kiro-cli-executor.ts
│   ├── test-runner.ts
│   ├── pull-request-updater.ts
│   ├── github-project-monitor.ts
│   ├── work-item-poller.ts
│   └── work-item-state-manager.ts
├── types/               # Type definitions
│   ├── config.ts
│   ├── work-item.ts
│   ├── build-result.ts
│   └── index.ts
├── errors/              # Custom error classes
│   ├── git-operation-error.ts
│   ├── test-failure-error.ts
│   └── index.ts
├── utils/               # Utility functions
│   ├── retry.ts
│   ├── logger.ts
│   └── sanitize.ts
├── lambda/              # Lambda function handlers
│   └── work-item-poller-handler.ts
└── index.ts             # Main entry point
```

### Module Exports

**Use Named Exports**:
```typescript
// Good - named exports
export class GitBranchManager { }
export interface ValidationResult { }
export function validateBranch(): ValidationResult { }

// Import
import { GitBranchManager, ValidationResult, validateBranch } from './git-branch-manager';
```

**Avoid Default Exports**:
```typescript
// Bad - default export
export default class GitBranchManager { }

// Requires
import GitBranchManager from './git-branch-manager'; // Name can vary
```

### Barrel Exports

**Use index.ts for Clean Imports**:
```typescript
// types/index.ts
export * from './config';
export * from './work-item';
export * from './build-result';

// Usage
import { WorkerConfig, WorkItem, BuildResult } from './types';
```

## Best Practices

### Immutability

**Prefer const Over let**:
```typescript
// Good
const config = loadConfig();
const items = await fetchWorkItems();

// Bad - unnecessary let
let config = loadConfig();
let items = await fetchWorkItems();
```

**Use Readonly for Immutable Properties**:
```typescript
interface WorkerConfig {
  readonly environment: string;
  readonly branchName: string;
}

class KiroWorker {
  private readonly config: WorkerConfig;
}
```

**Avoid Mutating Arrays and Objects**:
```typescript
// Good - create new array
const updatedItems = [...items, newItem];
const filteredItems = items.filter(item => item.isValid);

// Good - create new object
const updatedConfig = { ...config, timeout: 5000 };

// Bad - mutation
items.push(newItem);
config.timeout = 5000;
```

### Function Design

**Keep Functions Small and Focused**:
```typescript
// Good - single responsibility
async function checkoutBranch(branchName: string): Promise<void> {
  await git.checkout(branchName);
}

async function validateSpecFiles(specPath: string): Promise<ValidationResult> {
  const files = await fs.readdir(specPath);
  return validateFiles(files);
}

// Bad - doing too much
async function checkoutAndValidate(branchName: string, specPath: string): Promise<void> {
  await git.checkout(branchName);
  const files = await fs.readdir(specPath);
  if (!files.includes('requirements.md')) throw new Error('Missing requirements');
  if (!files.includes('design.md')) throw new Error('Missing design');
  // ... more validation
}
```

**Use Descriptive Parameter Names**:
```typescript
// Good
function retryOperation(
  operation: () => Promise<void>,
  maxAttempts: number,
  delayMs: number
): Promise<void> {
  // Implementation
}

// Bad
function retryOperation(op: () => Promise<void>, max: number, delay: number): Promise<void> {
  // Implementation
}
```

### Dependency Injection

**Use Constructor Injection**:
```typescript
// Good - dependencies injected
class KiroWorker {
  constructor(
    private readonly gitManager: GitBranchManager,
    private readonly testRunner: TestRunner,
    private readonly prUpdater: PullRequestUpdater
  ) {}
  
  async execute(): Promise<void> {
    await this.gitManager.checkoutBranch();
    await this.testRunner.runTests();
    await this.prUpdater.updatePR();
  }
}

// Bad - hard-coded dependencies
class KiroWorker {
  private gitManager = new GitBranchManager();
  private testRunner = new TestRunner();
  
  async execute(): Promise<void> {
    // Implementation
  }
}
```

### Logging

**Use Structured Logging**:
```typescript
// Good - structured logs
logger.info('Starting build', {
  buildId,
  environment,
  branchName
});

logger.error('Build failed', {
  buildId,
  error: error.message,
  stack: error.stack
});

// Bad - string concatenation
logger.info('Starting build ' + buildId + ' in ' + environment);
```

## AWS SDK v3 Best Practices

### Use Modular Imports

```typescript
// Good - import only what you need
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Bad - importing entire SDK
import AWS from 'aws-sdk';
```

### Reuse Clients

```typescript
// Good - create client once
class SecretManager {
  private readonly client: SecretsManagerClient;
  
  constructor() {
    this.client = new SecretsManagerClient({ region: 'us-east-1' });
  }
  
  async getSecret(secretId: string): Promise<string> {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await this.client.send(command);
    return response.SecretString ?? '';
  }
}

// Bad - creating client every time
async function getSecret(secretId: string): Promise<string> {
  const client = new SecretsManagerClient({ region: 'us-east-1' });
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await client.send(command);
  return response.SecretString ?? '';
}
```

### Handle AWS Errors

```typescript
import { SecretsManagerServiceException } from '@aws-sdk/client-secrets-manager';

async function getSecret(secretId: string): Promise<string> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);
    return response.SecretString ?? '';
  } catch (error) {
    if (error instanceof SecretsManagerServiceException) {
      logger.error('AWS Secrets Manager error', {
        code: error.name,
        message: error.message
      });
    }
    throw error;
  }
}
```

## Documentation

### JSDoc Comments

**Document Public APIs**:
```typescript
/**
 * Manages Git operations for the Kiro Worker including branch checkout,
 * validation, commits, and pushes.
 */
export class GitBranchManager {
  /**
   * Checks out the specified branch and validates that spec files exist.
   * 
   * @param branchName - The name of the branch to checkout
   * @returns A promise that resolves when checkout and validation complete
   * @throws {GitOperationError} If checkout fails or spec files are missing
   */
  async checkoutBranch(branchName: string): Promise<void> {
    // Implementation
  }
}
```

### Inline Comments

**Explain Why, Not What**:
```typescript
// Good - explains reasoning
// Retry with exponential backoff to handle transient network issues
await retryWithBackoff(operation, 3, 1000);

// Bad - states the obvious
// Call retry function with operation, 3 attempts, and 1000ms delay
await retryWithBackoff(operation, 3, 1000);
```

## Testing Requirements

### Test File Naming

```
src/components/git-branch-manager.ts
src/components/git-branch-manager.test.ts
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitBranchManager } from './git-branch-manager';

describe('GitBranchManager', () => {
  let manager: GitBranchManager;
  
  beforeEach(() => {
    manager = new GitBranchManager(mockConfig);
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  describe('checkoutBranch', () => {
    it('should checkout the specified branch', async () => {
      await manager.checkoutBranch('feature-branch');
      expect(mockGit.checkout).toHaveBeenCalledWith('feature-branch');
    });
    
    it('should throw error if branch does not exist', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Branch not found'));
      await expect(manager.checkoutBranch('invalid')).rejects.toThrow();
    });
  });
});
```

## Performance Considerations

### Avoid Unnecessary Async

```typescript
// Good - synchronous when possible
function validateConfig(config: WorkerConfig): boolean {
  return config.environment !== '' && config.branchName !== '';
}

// Bad - unnecessary async
async function validateConfig(config: WorkerConfig): Promise<boolean> {
  return config.environment !== '' && config.branchName !== '';
}
```

### Use Promise.all for Parallel Operations

```typescript
// Good - parallel execution
const [secrets, config, workItems] = await Promise.all([
  fetchSecrets(),
  loadConfig(),
  fetchWorkItems()
]);

// Bad - sequential execution
const secrets = await fetchSecrets();
const config = await loadConfig();
const workItems = await fetchWorkItems();
```

## Security

### Sanitize Sensitive Data

```typescript
function sanitizeError(error: Error): string {
  let message = error.message;
  // Remove tokens, passwords, secrets
  message = message.replace(/token[=:]\s*[\w-]+/gi, 'token=[REDACTED]');
  message = message.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
  return message;
}
```

### Validate Input

```typescript
function validateBranchName(branchName: string): void {
  if (!branchName || branchName.trim() === '') {
    throw new ValidationError('Branch name cannot be empty');
  }
  
  if (!/^[a-zA-Z0-9/_-]+$/.test(branchName)) {
    throw new ValidationError('Branch name contains invalid characters');
  }
}
```

## Summary

- Enable strict TypeScript compiler options
- Use explicit types and avoid `any`
- Prefer interfaces for objects, types for unions
- Use async/await consistently
- Keep functions small and focused
- Use dependency injection
- Document public APIs with JSDoc
- Follow naming conventions consistently
- Handle errors with custom error classes
- Write comprehensive tests for all code
