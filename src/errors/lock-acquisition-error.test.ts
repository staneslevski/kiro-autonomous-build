import { describe, it, expect } from 'vitest';
import { LockAcquisitionError } from './lock-acquisition-error';

describe('LockAcquisitionError', () => {
  it('should create error with lock key', () => {
    const error = new LockAcquisitionError('Failed to acquire lock', 'work-item-lock');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LockAcquisitionError');
    expect(error.message).toBe('Failed to acquire lock');
    expect(error.lockKey).toBe('work-item-lock');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('DynamoDB error');
    const error = new LockAcquisitionError('Lock acquisition failed', 'my-lock', cause);
    
    expect(error.cause).toBe(cause);
    expect(error.lockKey).toBe('my-lock');
  });

  it('should have proper stack trace', () => {
    const error = new LockAcquisitionError('Test error', 'test-lock');
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('LockAcquisitionError');
  });
});
