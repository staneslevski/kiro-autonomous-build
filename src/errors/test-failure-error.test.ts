import { describe, it, expect } from 'vitest';
import { TestFailureError } from './test-failure-error';

describe('TestFailureError', () => {
  it('should create error with test counts', () => {
    const error = new TestFailureError('Tests failed', 3, 10);
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TestFailureError');
    expect(error.message).toBe('Tests failed');
    expect(error.failedCount).toBe(3);
    expect(error.totalCount).toBe(10);
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('Assertion failed');
    const error = new TestFailureError('Tests failed', 1, 5, cause);
    
    expect(error.cause).toBe(cause);
  });

  it('should have proper stack trace', () => {
    const error = new TestFailureError('Test error', 1, 1);
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('TestFailureError');
  });
});
