# Testing Standards and Requirements

## CRITICAL TESTING REQUIREMENTS

### ⚠️ MANDATORY TESTING RULES ⚠️

**THESE RULES ARE ABSOLUTE AND NON-NEGOTIABLE:**

1. **ALL TESTS MUST PASS** - No exceptions, no compromises
2. **MINIMUM 80% CODE COVERAGE** - For all components, classes, and functions
3. **DO NOT SKIP TESTS** - Never use `.skip()` or similar mechanisms
4. **DO NOT IGNORE TESTS** - Never comment out failing tests
5. **DO NOT DISABLE TESTS** - Never remove or disable test execution
6. **FIX FAILING TESTS** - Always fix the code or test until all tests pass
7. **NO TASK IS COMPLETE** - Until all tests pass with ≥80% coverage

**If tests fail, you MUST:**
- Investigate the root cause
- Fix the implementation code OR fix the test
- Re-run tests until they pass
- Never mark a task as complete with failing tests

**If coverage is below 80%, you MUST:**
- Write additional tests for uncovered code paths
- Test edge cases and error conditions
- Achieve ≥80% coverage before completing the task

## Testing Framework: Vitest

### Why Vitest?

- Fast execution with native ESM support
- Excellent TypeScript integration
- Built-in coverage with c8/istanbul
- Compatible with Jest API (easy migration)
- Watch mode for development
- Snapshot testing support

### Installation

```bash
npm install -D vitest @vitest/coverage-v8 @vitest/ui
```

### Configuration

**vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/**',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/'],
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
```

**Key Configuration Points**:
- `thresholds` set to 80% for all metrics - **TESTS WILL FAIL IF NOT MET**
- Coverage reports in multiple formats for CI/CD integration
- Reasonable timeouts for async operations
- Exclude test files and type definitions from coverage

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

## Test Structure and Organization

### File Naming Convention

```
src/components/git-branch-manager.ts
src/components/git-branch-manager.test.ts
```

**Rules**:
- Test files must be co-located with source files
- Use `.test.ts` suffix for test files
- One test file per source file

### Test Suite Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitBranchManager } from './git-branch-manager';
import type { GitConfig } from '../types';

describe('GitBranchManager', () => {
  let manager: GitBranchManager;
  let mockConfig: GitConfig;
  
  beforeEach(() => {
    // Setup before each test
    mockConfig = {
      repoPath: '/tmp/test-repo',
      credentials: { token: 'test-token' }
    };
    manager = new GitBranchManager(mockConfig);
  });
  
  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });
  
  describe('checkoutBranch', () => {
    it('should successfully checkout an existing branch', async () => {
      // Arrange
      const branchName = 'feature-branch';
      
      // Act
      await manager.checkoutBranch(branchName);
      
      // Assert
      expect(manager.currentBranch).toBe(branchName);
    });
    
    it('should throw GitOperationError when branch does not exist', async () => {
      // Arrange
      const invalidBranch = 'non-existent-branch';
      
      // Act & Assert
      await expect(manager.checkoutBranch(invalidBranch))
        .rejects
        .toThrow(GitOperationError);
    });
    
    it('should retry on transient failures', async () => {
      // Test retry logic
    });
  });
  
  describe('validateSpecFiles', () => {
    it('should return valid result when all spec files exist', async () => {
      // Test happy path
    });
    
    it('should return invalid result when requirements.md is missing', async () => {
      // Test missing file
    });
    
    it('should return invalid result when design.md is missing', async () => {
      // Test missing file
    });
    
    it('should return invalid result when tasks.md is missing', async () => {
      // Test missing file
    });
  });
});
```

**Structure Guidelines**:
- Use `describe` blocks to group related tests
- Use `it` or `test` for individual test cases
- Follow Arrange-Act-Assert pattern
- Use descriptive test names that explain the scenario
- Test both success and failure paths

## Test Coverage Requirements

### Minimum Coverage: 80%

**Coverage Metrics**:
- **Lines**: 80% of executable lines must be covered
- **Functions**: 80% of functions must be called in tests
- **Branches**: 80% of conditional branches must be tested
- **Statements**: 80% of statements must be executed

### What to Test

**1. Happy Path (Success Scenarios)**:
```typescript
it('should successfully execute the main workflow', async () => {
  const result = await worker.execute();
  expect(result.success).toBe(true);
});
```

**2. Error Conditions**:
```typescript
it('should handle Git operation failures', async () => {
  mockGit.checkout.mockRejectedValue(new Error('Network error'));
  await expect(manager.checkoutBranch('branch')).rejects.toThrow();
});
```

**3. Edge Cases**:
```typescript
it('should handle empty branch name', async () => {
  await expect(manager.checkoutBranch('')).rejects.toThrow(ValidationError);
});

it('should handle branch name with special characters', async () => {
  await expect(manager.checkoutBranch('feature/test-123')).resolves.not.toThrow();
});
```

**4. Boundary Conditions**:
```typescript
it('should fail after maximum retry attempts', async () => {
  // Mock to fail 3 times
  mockOperation.mockRejectedValue(new Error('Failure'));
  await expect(retryOperation(mockOperation, 3)).rejects.toThrow();
});
```

**5. State Changes**:
```typescript
it('should update internal state after successful operation', async () => {
  await manager.checkoutBranch('feature');
  expect(manager.currentBranch).toBe('feature');
  expect(manager.isClean).toBe(true);
});
```

**6. Integration Points**:
```typescript
it('should call GitHub API with correct parameters', async () => {
  await prUpdater.updatePR(prDetails);
  expect(mockGitHubAPI.updatePullRequest).toHaveBeenCalledWith({
    owner: 'org',
    repo: 'repo',
    pull_number: 123,
    body: expect.stringContaining('Test Results')
  });
});
```

### Coverage Verification

**Run coverage report**:
```bash
npm run test:coverage
```

**Check coverage thresholds**:
- Vitest will fail if coverage is below 80%
- Review HTML report in `coverage/index.html`
- Identify uncovered lines and add tests

**Example Coverage Report**:
```
File                          | % Stmts | % Branch | % Funcs | % Lines
------------------------------|---------|----------|---------|--------
All files                     |   85.23 |    82.14 |   87.50 |   85.23
 git-branch-manager.ts        |   92.00 |    88.00 |   95.00 |   92.00
 test-runner.ts               |   78.50 |    75.00 |   80.00 |   78.50  ← NEEDS MORE TESTS
 pull-request-updater.ts      |   88.00 |    85.00 |   90.00 |   88.00
```

## Mocking and Test Doubles

### Mocking External Dependencies

**Use Vitest's vi.mock()**:
```typescript
import { vi } from 'vitest';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

vi.mock('@aws-sdk/client-secrets-manager');

describe('SecretManager', () => {
  it('should retrieve secret from AWS', async () => {
    const mockSend = vi.fn().mockResolvedValue({
      SecretString: 'my-secret-value'
    });
    
    SecretsManagerClient.prototype.send = mockSend;
    
    const secret = await secretManager.getSecret('my-secret');
    expect(secret).toBe('my-secret-value');
  });
});
```

### Mocking File System

```typescript
import { vi } from 'vitest';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('FileValidator', () => {
  it('should validate spec files exist', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      'requirements.md',
      'design.md',
      'tasks.md'
    ] as any);
    
    const result = await validator.validateSpecFiles('/path/to/spec');
    expect(result.isValid).toBe(true);
  });
});
```

### Mocking Git Operations

```typescript
import { vi } from 'vitest';
import simpleGit from 'simple-git';

vi.mock('simple-git');

describe('GitBranchManager', () => {
  let mockGit: any;
  
  beforeEach(() => {
    mockGit = {
      checkout: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined)
    };
    
    vi.mocked(simpleGit).mockReturnValue(mockGit as any);
  });
  
  it('should checkout branch', async () => {
    await manager.checkoutBranch('feature');
    expect(mockGit.checkout).toHaveBeenCalledWith('feature');
  });
});
```

### Spy on Methods

```typescript
import { vi } from 'vitest';

describe('KiroWorker', () => {
  it('should call all pipeline steps in order', async () => {
    const checkoutSpy = vi.spyOn(worker['gitManager'], 'checkoutBranch');
    const syncSpy = vi.spyOn(worker['steeringSynchronizer'], 'synchronize');
    const executeSpy = vi.spyOn(worker['kiroExecutor'], 'execute');
    
    await worker.run();
    
    expect(checkoutSpy).toHaveBeenCalledBefore(syncSpy);
    expect(syncSpy).toHaveBeenCalledBefore(executeSpy);
  });
});
```

## Async Testing

### Testing Promises

```typescript
it('should resolve with result', async () => {
  const result = await asyncOperation();
  expect(result).toBe('success');
});

it('should reject with error', async () => {
  await expect(failingOperation()).rejects.toThrow('Error message');
});
```

### Testing Timeouts

```typescript
it('should timeout after specified duration', async () => {
  const promise = longRunningOperation();
  
  await expect(promise).rejects.toThrow('Timeout');
}, 15000); // 15 second timeout for this test
```

### Testing Retry Logic

```typescript
it('should retry operation 3 times before failing', async () => {
  const mockOp = vi.fn()
    .mockRejectedValueOnce(new Error('Fail 1'))
    .mockRejectedValueOnce(new Error('Fail 2'))
    .mockRejectedValueOnce(new Error('Fail 3'));
  
  await expect(retryOperation(mockOp, 3)).rejects.toThrow();
  expect(mockOp).toHaveBeenCalledTimes(3);
});

it('should succeed on second attempt', async () => {
  const mockOp = vi.fn()
    .mockRejectedValueOnce(new Error('Fail'))
    .mockResolvedValueOnce('Success');
  
  const result = await retryOperation(mockOp, 3);
  expect(result).toBe('Success');
  expect(mockOp).toHaveBeenCalledTimes(2);
});
```

## Property-Based Testing

### Using fast-check

**Installation**:
```bash
npm install -D fast-check
```

**Example Property Tests**:
```typescript
import { describe, it } from 'vitest';
import * as fc from 'fast-check';

describe('Branch Name Generator', () => {
  it('should always generate unique branch names', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 100 }),
        (seeds) => {
          const names = seeds.map(seed => generateBranchName(seed));
          const uniqueNames = new Set(names);
          return names.length === uniqueNames.size;
        }
      )
    );
  });
  
  it('should generate valid branch names', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat(),
        (prefix, timestamp) => {
          const branchName = generateBranchName(prefix, timestamp);
          // Branch names must match Git naming rules
          return /^[a-zA-Z0-9/_-]+$/.test(branchName);
        }
      )
    );
  });
});

describe('Coverage Calculator', () => {
  it('should always return percentage between 0 and 100', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        (covered, total) => {
          if (total === 0) return true; // Skip division by zero
          const percentage = calculateCoverage(covered, total);
          return percentage >= 0 && percentage <= 100;
        }
      )
    );
  });
});

describe('Retry Logic', () => {
  it('should eventually succeed or exhaust attempts', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10 }),
        fc.nat({ max: 5 }),
        async (failCount, maxAttempts) => {
          let attempts = 0;
          const operation = async () => {
            attempts++;
            if (attempts <= failCount) {
              throw new Error('Failure');
            }
            return 'Success';
          };
          
          try {
            await retryOperation(operation, maxAttempts);
            return attempts <= maxAttempts;
          } catch {
            return attempts === maxAttempts;
          }
        }
      )
    );
  });
});
```

## Integration Testing

### Testing Component Integration

```typescript
describe('KiroWorker Integration', () => {
  let worker: KiroWorker;
  let testRepo: string;
  
  beforeEach(async () => {
    // Setup real test repository
    testRepo = await createTestRepository();
    worker = new KiroWorker({
      repoPath: testRepo,
      environment: 'test'
    });
  });
  
  afterEach(async () => {
    // Cleanup test repository
    await cleanupTestRepository(testRepo);
  });
  
  it('should execute complete pipeline', async () => {
    const result = await worker.execute();
    
    expect(result.success).toBe(true);
    expect(result.testsRun).toBeGreaterThan(0);
    expect(result.coverage).toBeGreaterThanOrEqual(80);
  });
});
```

### Testing AWS Integration

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

describe('SecretManager Integration', () => {
  const secretsManagerMock = mockClient(SecretsManagerClient);
  
  beforeEach(() => {
    secretsManagerMock.reset();
  });
  
  it('should retrieve secret from AWS', async () => {
    secretsManagerMock
      .on(GetSecretValueCommand)
      .resolves({
        SecretString: 'my-secret-value'
      });
    
    const secret = await secretManager.getSecret('my-secret');
    expect(secret).toBe('my-secret-value');
  });
});
```

## Test Data Management

### Test Fixtures

```typescript
// tests/fixtures/work-items.ts
export const mockWorkItem: WorkItem = {
  id: 'item-123',
  title: 'Implement feature X',
  branchName: 'feature-x',
  status: 'For Implementation',
  createdAt: new Date('2026-01-01')
};

export const mockWorkItems: WorkItem[] = [
  mockWorkItem,
  {
    id: 'item-456',
    title: 'Fix bug Y',
    branchName: 'fix-bug-y',
    status: 'For Implementation',
    createdAt: new Date('2026-01-02')
  }
];
```

### Factory Functions

```typescript
// tests/factories/work-item-factory.ts
export function createMockWorkItem(overrides?: Partial<WorkItem>): WorkItem {
  return {
    id: 'item-123',
    title: 'Test work item',
    branchName: 'test-branch',
    status: 'For Implementation',
    createdAt: new Date(),
    ...overrides
  };
}

// Usage
const workItem = createMockWorkItem({ branchName: 'custom-branch' });
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests with coverage
        run: npm run test:coverage
        
      - name: Check coverage thresholds
        run: |
          if [ $(jq '.total.lines.pct' coverage/coverage-summary.json | cut -d. -f1) -lt 80 ]; then
            echo "Coverage below 80%"
            exit 1
          fi
          
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Test Debugging

### Running Specific Tests

```bash
# Run single test file
npm test git-branch-manager.test.ts

# Run tests matching pattern
npm test -- --grep "checkout"

# Run in watch mode
npm run test:watch
```

### Debug Mode

```typescript
import { describe, it } from 'vitest';

describe.only('GitBranchManager', () => {  // Only run this suite
  it.only('should checkout branch', async () => {  // Only run this test
    // Test implementation
  });
});
```

### Verbose Output

```bash
# Run with verbose output
npm test -- --reporter=verbose

# Run with UI
npm run test:ui
```

## Common Testing Patterns

### Testing Error Messages

```typescript
it('should throw error with specific message', async () => {
  await expect(operation()).rejects.toThrow('Branch not found');
});

it('should throw specific error type', async () => {
  await expect(operation()).rejects.toThrow(GitOperationError);
});
```

### Testing State Transitions

```typescript
it('should transition from idle to running to complete', async () => {
  expect(worker.state).toBe('idle');
  
  const promise = worker.execute();
  expect(worker.state).toBe('running');
  
  await promise;
  expect(worker.state).toBe('complete');
});
```

### Testing Callbacks

```typescript
it('should call callback on completion', async () => {
  const callback = vi.fn();
  await worker.execute(callback);
  expect(callback).toHaveBeenCalledWith({ success: true });
});
```

## Summary: Testing Checklist

Before marking any task as complete, verify:

- [ ] All tests pass (no failures, no skipped tests)
- [ ] Code coverage is ≥80% for all metrics
- [ ] Tests cover happy path scenarios
- [ ] Tests cover error conditions
- [ ] Tests cover edge cases
- [ ] Tests cover boundary conditions
- [ ] Integration points are tested
- [ ] Async operations are tested properly
- [ ] Mocks are used appropriately
- [ ] Test names are descriptive
- [ ] Tests follow AAA pattern (Arrange-Act-Assert)
- [ ] No tests are commented out or skipped
- [ ] Coverage report shows no critical gaps

**REMEMBER: NO EXCEPTIONS TO THESE RULES. ALL TESTS MUST PASS. COVERAGE MUST BE ≥80%.**
