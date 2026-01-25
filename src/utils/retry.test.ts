import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from './retry';

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    
    const result = await retryWithBackoff(operation);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce('success');
    
    const result = await retryWithBackoff(operation);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max attempts', async () => {
    const error = new Error('Persistent failure');
    const operation = vi.fn().mockRejectedValue(error);
    
    await expect(retryWithBackoff(operation, { maxAttempts: 3 }))
      .rejects
      .toThrow('Persistent failure');
    
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should use custom max attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Fail'));
    
    await expect(retryWithBackoff(operation, { maxAttempts: 5, initialDelay: 10 }))
      .rejects
      .toThrow();
    
    expect(operation).toHaveBeenCalledTimes(5);
  }, 15000);

  it('should apply exponential backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce('success');
    
    const startTime = Date.now();
    await retryWithBackoff(operation, { 
      initialDelay: 100, 
      backoffMultiplier: 2 
    });
    const duration = Date.now() - startTime;
    
    // Should wait at least 100ms + 200ms = 300ms
    expect(duration).toBeGreaterThanOrEqual(300);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should respect max delay', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce('success');
    
    await retryWithBackoff(operation, { 
      initialDelay: 1000,
      maxDelay: 1500,
      backoffMultiplier: 3
    });
    
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should handle non-Error rejections', async () => {
    const operation = vi.fn().mockRejectedValue('string error');
    
    await expect(retryWithBackoff(operation, { maxAttempts: 2 }))
      .rejects
      .toThrow('string error');
    
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should use default options when none provided', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Fail'));
    
    await expect(retryWithBackoff(operation)).rejects.toThrow();
    
    // Default maxAttempts is 3
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
