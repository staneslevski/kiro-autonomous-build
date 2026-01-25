import { describe, it, expect } from 'vitest';
import { CoverageThresholdError } from './coverage-threshold-error';

describe('CoverageThresholdError', () => {
  it('should create error with coverage values', () => {
    const error = new CoverageThresholdError('Coverage below threshold', 75, 80);
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CoverageThresholdError');
    expect(error.message).toBe('Coverage below threshold');
    expect(error.actualCoverage).toBe(75);
    expect(error.threshold).toBe(80);
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('Coverage calculation failed');
    const error = new CoverageThresholdError('Coverage error', 70, 80, cause);
    
    expect(error.cause).toBe(cause);
  });

  it('should have proper stack trace', () => {
    const error = new CoverageThresholdError('Test error', 50, 80);
    
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('CoverageThresholdError');
  });
});
