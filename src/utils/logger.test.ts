import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should log debug message', () => {
    logger.debug('Debug message');
    
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    
    expect(logEntry.level).toBe('DEBUG');
    expect(logEntry.message).toBe('Debug message');
    expect(logEntry.timestamp).toBeDefined();
  });

  it('should log info message with context', () => {
    logger.info('Info message', { userId: '123', action: 'login' });
    
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    
    expect(logEntry.level).toBe('INFO');
    expect(logEntry.message).toBe('Info message');
    expect(logEntry.context).toEqual({
      userId: '123',
      action: 'login',
      environment: expect.any(String)
    });
  });

  it('should log warning message', () => {
    logger.warn('Warning message');
    
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    
    expect(logEntry.level).toBe('WARN');
    expect(logEntry.message).toBe('Warning message');
  });

  it('should log error message with Error object', () => {
    const error = new Error('Test error');
    logger.error('Error occurred', error);
    
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    
    expect(logEntry.level).toBe('ERROR');
    expect(logEntry.message).toBe('Error occurred');
    expect(logEntry.error).toEqual({
      name: 'Error',
      message: 'Test error',
      stack: expect.any(String)
    });
  });

  it('should log error message without Error object', () => {
    logger.error('Error occurred');
    
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    
    expect(logEntry.level).toBe('ERROR');
    expect(logEntry.message).toBe('Error occurred');
    expect(logEntry.error).toBeUndefined();
  });

  it('should include timestamp in ISO format', () => {
    logger.info('Test message');
    
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    const timestamp = new Date(logEntry.timestamp);
    
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.toISOString()).toBe(logEntry.timestamp);
  });

  it('should output valid JSON', () => {
    logger.info('Test', { key: 'value' });
    
    const output = consoleLogSpy.mock.calls[0][0] as string;
    
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should handle error with context', () => {
    const error = new Error('Test error');
    logger.error('Error with context', error, { buildId: 'build-123' });
    
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    
    expect(logEntry.context).toEqual({
      buildId: 'build-123',
      environment: expect.any(String)
    });
    expect(logEntry.error).toBeDefined();
  });
});
