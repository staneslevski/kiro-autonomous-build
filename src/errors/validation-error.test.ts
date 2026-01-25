import { describe, it, expect } from 'vitest';
import { ValidationError } from './validation-error';

describe('ValidationError', () => {
  it('should create error with validation errors', () => {
    const errors = ['Missing branch name', 'Invalid spec path'];
    const error = new ValidationError('Validation failed', errors);
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Validation failed');
    expect(error.validationErrors).toEqual(errors);
    expect(error.cause).toBeUndefined();
  });

  it('should create error with empty validation errors', () => {
    const error = new ValidationError('Validation failed', []);
    
    expect(error.validationErrors).toEqual([]);
  });

  it('should create error with cause', () => {
    const cause = new Error('Validation check failed');
    const error = new ValidationError('Validation error', ['Error 1'], cause);
    
    expect(error.cause).toBe(cause);
  });

  it('should have proper stack trace', () => {
    const error = new ValidationError('Test error', ['Error']);
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ValidationError');
  });
});
