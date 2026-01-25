import { describe, it, expect } from 'vitest';
import { WorkItemError } from './work-item-error';

describe('WorkItemError', () => {
  it('should create error with work item ID', () => {
    const error = new WorkItemError('Work item processing failed', 'item-123');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WorkItemError');
    expect(error.message).toBe('Work item processing failed');
    expect(error.workItemId).toBe('item-123');
    expect(error.cause).toBeUndefined();
  });

  it('should create error without work item ID', () => {
    const error = new WorkItemError('Work item error');
    
    expect(error.workItemId).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('Database error');
    const error = new WorkItemError('Failed to process', 'item-456', cause);
    
    expect(error.cause).toBe(cause);
    expect(error.workItemId).toBe('item-456');
  });

  it('should have proper stack trace', () => {
    const error = new WorkItemError('Test error', 'item-789');
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('WorkItemError');
  });
});
