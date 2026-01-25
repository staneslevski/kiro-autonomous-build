import { describe, it, expect } from 'vitest';
import { sanitizeString, sanitizeError, sanitizeObject } from './sanitize';

describe('sanitizeString', () => {
  it('should redact token values', () => {
    const input = 'token=abc123def456';
    const result = sanitizeString(input);
    
    expect(result).toBe('token=[REDACTED]');
  });

  it('should redact GitHub personal access tokens', () => {
    const input = 'Using token ghp_1234567890abcdefghij';
    const result = sanitizeString(input);
    
    expect(result).toBe('Using token [REDACTED]');
  });

  it('should redact password values', () => {
    const input = 'password=mySecretPass123';
    const result = sanitizeString(input);
    
    expect(result).toBe('password=[REDACTED]');
  });

  it('should redact API keys', () => {
    const input = 'api_key=sk_test_1234567890';
    const result = sanitizeString(input);
    
    expect(result).toBe('api_key=[REDACTED]');
  });

  it('should redact AWS access keys', () => {
    const input = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
    const result = sanitizeString(input);
    
    expect(result).toBe('AWS Key: [REDACTED]');
  });

  it('should redact bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const result = sanitizeString(input);
    
    expect(result).toBe('Authorization: Bearer [REDACTED]');
  });

  it('should redact multiple secrets in same string', () => {
    const input = 'token=abc123 password=secret123 api_key=key456';
    const result = sanitizeString(input);
    
    expect(result).toContain('token=[REDACTED]');
    expect(result).toContain('password=[REDACTED]');
    expect(result).toContain('api_key=[REDACTED]');
  });

  it('should not modify strings without secrets', () => {
    const input = 'This is a normal log message with no secrets';
    const result = sanitizeString(input);
    
    expect(result).toBe(input);
  });

  it('should handle empty strings', () => {
    const result = sanitizeString('');
    
    expect(result).toBe('');
  });
});

describe('sanitizeError', () => {
  it('should sanitize error message', () => {
    const error = new Error('Failed with token=abc123');
    const sanitized = sanitizeError(error);
    
    expect(sanitized.message).toBe('Failed with token=[REDACTED]');
    expect(sanitized.name).toBe('Error');
  });

  it('should sanitize error stack', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n  at token=secret123';
    
    const sanitized = sanitizeError(error);
    
    expect(sanitized.stack).toContain('token=[REDACTED]');
  });

  it('should handle errors without stack', () => {
    const error = new Error('Test');
    const originalStack = error.stack;
    delete error.stack;
    
    const sanitized = sanitizeError(error);
    
    // New Error() will create a stack, so we just verify it doesn't crash
    expect(sanitized.message).toBe('Test');
    expect(sanitized.name).toBe('Error');
  });
});

describe('sanitizeObject', () => {
  it('should sanitize string values in object', () => {
    const obj = {
      message: 'Error with token=abc123',
      status: 'failed'
    };
    
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.message).toBe('Error with token=[REDACTED]');
    expect(sanitized.status).toBe('failed');
  });

  it('should sanitize nested objects', () => {
    const obj = {
      user: {
        name: 'John',
        credentials: {
          password: 'password=secret123'
        }
      }
    };
    
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.user.name).toBe('John');
    expect(sanitized.user.credentials.password).toBe('password=[REDACTED]');
  });

  it('should sanitize arrays', () => {
    const obj = {
      logs: [
        'Log 1 with token=abc',
        'Log 2 with password=secret',
        'Normal log'
      ]
    };
    
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.logs[0]).toBe('Log 1 with token=[REDACTED]');
    expect(sanitized.logs[1]).toBe('Log 2 with password=[REDACTED]');
    expect(sanitized.logs[2]).toBe('Normal log');
  });

  it('should handle null and undefined', () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
  });

  it('should handle primitive values', () => {
    expect(sanitizeObject(123)).toBe(123);
    expect(sanitizeObject(true)).toBe(true);
  });

  it('should sanitize complex nested structures', () => {
    const obj = {
      config: {
        env: 'production',
        secrets: {
          apiKey: 'api_key=sk_test_123',
          dbPassword: 'password=dbpass'
        }
      },
      logs: ['token=abc', 'normal log']
    };
    
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.config.env).toBe('production');
    expect(sanitized.config.secrets.apiKey).toBe('api_key=[REDACTED]');
    expect(sanitized.config.secrets.dbPassword).toBe('password=[REDACTED]');
    expect(sanitized.logs[0]).toBe('token=[REDACTED]');
  });
});
