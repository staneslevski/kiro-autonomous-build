/**
 * Retry Utility
 * 
 * Provides retry functionality with exponential backoff.
 */

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  
  /** Backoff multiplier (default: 2) */
  multiplier?: number;
}

/**
 * Retry an operation with exponential backoff
 * 
 * Retries the operation up to maxAttempts times with exponential backoff.
 * Delay doubles after each attempt (multiplier=2) up to maxDelay.
 * 
 * @param operation - Async operation to retry
 * @param options - Retry options
 * @returns Promise that resolves to operation result
 * @throws Last error if all attempts fail
 * 
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => await fetchData(),
 *   { maxAttempts: 3, initialDelay: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    multiplier = 2,
  } = options;
  
  let lastError: Error | undefined;
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't delay after last attempt
      if (attempt < maxAttempts) {
        // Wait before next attempt
        await sleep(delay);
        
        // Calculate next delay with exponential backoff
        delay = Math.min(delay * multiplier, maxDelay);
      }
    }
  }
  
  // All attempts failed
  throw lastError || new Error('Operation failed after all retry attempts');
}

/**
 * Sleep for specified duration
 * 
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
