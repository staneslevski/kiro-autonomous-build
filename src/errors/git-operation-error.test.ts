import { describe, it, expect } from 'vitest';
import { GitOperationError } from './git-operation-error';

describe('GitOperationError', () => {
  it('should create error with message and operation', () => {
    const error = new GitOperationError('Failed to checkout branch', 'checkout');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GitOperationError');
    expect(error.message).toBe('Failed to checkout branch');
    expect(error.operation).toBe('checkout');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('Network timeout');
    const error = new GitOperationError('Failed to push', 'push', cause);
    
    expect(error.cause).toBe(cause);
    expect(error.operation).toBe('push');
  });

  it('should have proper stack trace', () => {
    const error = new GitOperationError('Test error', 'test');
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('GitOperationError');
  });

  it('should preserve error name', () => {
    const error = new GitOperationError('Test', 'test');
    
    expect(error.name).toBe('GitOperationError');
  });
});
