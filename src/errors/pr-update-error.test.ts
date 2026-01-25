import { describe, it, expect } from 'vitest';
import { PRUpdateError } from './pr-update-error';

describe('PRUpdateError', () => {
  it('should create error with PR number', () => {
    const error = new PRUpdateError('Failed to update PR', 123);
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PRUpdateError');
    expect(error.message).toBe('Failed to update PR');
    expect(error.prNumber).toBe(123);
    expect(error.cause).toBeUndefined();
  });

  it('should create error without PR number', () => {
    const error = new PRUpdateError('PR not found');
    
    expect(error.prNumber).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('API error');
    const error = new PRUpdateError('Failed to update', 456, cause);
    
    expect(error.cause).toBe(cause);
    expect(error.prNumber).toBe(456);
  });

  it('should have proper stack trace', () => {
    const error = new PRUpdateError('Test error', 789);
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('PRUpdateError');
  });
});
