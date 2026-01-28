/**
 * Unit tests for Retry Utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { retry } from '../../lib/utils/retry';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('successful operations', () => {
    it('should return result on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should return result on second attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation);
      
      // Fast-forward through delay
      await vi.runAllTimersAsync();
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
    
    it('should return result on third attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation);
      
      // Fast-forward through delays
      await vi.runAllTimersAsync();
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('failed operations', () => {
    it('should throw error after max attempts', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);
      
      const promise = retry(operation, { maxAttempts: 3 });
      
      // Fast-forward through all delays
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Operation failed');
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should throw last error', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));
      
      const promise = retry(operation, { maxAttempts: 3 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Error 3');
    });
    
    it('should handle non-Error rejections', async () => {
      const operation = vi.fn().mockRejectedValue('string error');
      
      const promise = retry(operation, { maxAttempts: 2 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow();
    });
  });
  
  describe('exponential backoff', () => {
    it('should use initial delay on first retry', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, { initialDelay: 1000 });
      
      // Should wait 1000ms before second attempt
      await vi.advanceTimersByTimeAsync(999);
      expect(operation).toHaveBeenCalledTimes(1);
      
      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(operation).toHaveBeenCalledTimes(2);
    });
    
    it('should double delay on each retry (multiplier=2)', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, {
        initialDelay: 1000,
        multiplier: 2,
      });
      
      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Second retry: 2000ms (doubled)
      await vi.advanceTimersByTimeAsync(2000);
      await promise;
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should respect max delay cap', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, {
        initialDelay: 5000,
        maxDelay: 8000,
        multiplier: 2,
      });
      
      // First retry: 5000ms
      await vi.advanceTimersByTimeAsync(5000);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Second retry: should be capped at 8000ms (not 10000ms)
      await vi.advanceTimersByTimeAsync(8000);
      await promise;
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should not delay after last attempt', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      
      const promise = retry(operation, {
        maxAttempts: 2,
        initialDelay: 1000,
      });
      
      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // No more delays - should reject immediately
      await expect(promise).rejects.toThrow();
    });
  });
  
  describe('custom options', () => {
    it('should respect custom maxAttempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      
      const promise = retry(operation, { maxAttempts: 5 });
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(5);
    });
    
    it('should respect custom initialDelay', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, { initialDelay: 2000 });
      
      await vi.advanceTimersByTimeAsync(1999);
      expect(operation).toHaveBeenCalledTimes(1);
      
      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(operation).toHaveBeenCalledTimes(2);
    });
    
    it('should respect custom multiplier', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, {
        initialDelay: 1000,
        multiplier: 3, // Triple instead of double
      });
      
      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Second retry: 3000ms (tripled)
      await vi.advanceTimersByTimeAsync(3000);
      await promise;
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('default options', () => {
    it('should use default maxAttempts=3', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      
      const promise = retry(operation);
      
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should use default initialDelay=1000', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation);
      
      await vi.advanceTimersByTimeAsync(1000);
      await promise;
      expect(operation).toHaveBeenCalledTimes(2);
    });
    
    it('should use default maxDelay=10000', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, {
        initialDelay: 8000,
        multiplier: 2,
      });
      
      // First retry: 8000ms
      await vi.advanceTimersByTimeAsync(8000);
      
      // Second retry: should be capped at 10000ms (not 16000ms)
      await vi.advanceTimersByTimeAsync(10000);
      await promise;
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should use default multiplier=2', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retry(operation, { initialDelay: 1000 });
      
      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      
      // Second retry: 2000ms (doubled)
      await vi.advanceTimersByTimeAsync(2000);
      await promise;
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('edge cases', () => {
    it('should handle maxAttempts=1', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Fail'));
      
      await expect(retry(operation, { maxAttempts: 1 })).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should handle operations that return undefined', async () => {
      const operation = vi.fn().mockResolvedValue(undefined);
      
      const result = await retry(operation);
      
      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should handle operations that return null', async () => {
      const operation = vi.fn().mockResolvedValue(null);
      
      const result = await retry(operation);
      
      expect(result).toBeNull();
      expect(operation).toHaveBeenCalledTimes(1);
    });
    
    it('should handle operations that return objects', async () => {
      const result = { data: 'test' };
      const operation = vi.fn().mockResolvedValue(result);
      
      const returnedResult = await retry(operation);
      
      expect(returnedResult).toBe(result);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
