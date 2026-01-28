/**
 * Unit tests for Structured Logger
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StructuredLogger } from '../../lib/utils/structured-logger';

describe('StructuredLogger', () => {
  let consoleLogSpy: any;
  
  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    consoleLogSpy.mockRestore();
  });
  
  describe('constructor', () => {
    it('should create logger without component', () => {
      const logger = new StructuredLogger();
      
      logger.info('Test message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBeUndefined();
    });
    
    it('should create logger with component', () => {
      const logger = new StructuredLogger('TestComponent');
      
      logger.info('Test message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('TestComponent');
    });
  });
  
  describe('log', () => {
    it('should format output as JSON', () => {
      const logger = new StructuredLogger();
      
      logger.log('info', 'Test message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });
    
    it('should include timestamp, level, and message', () => {
      const logger = new StructuredLogger();
      
      logger.log('info', 'Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Test message');
    });
    
    it('should include context data', () => {
      const logger = new StructuredLogger();
      
      logger.log('info', 'Test message', {
        userId: '123',
        action: 'login',
      });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.userId).toBe('123');
      expect(logEntry.action).toBe('login');
    });
    
    it('should serialize errors properly', () => {
      const logger = new StructuredLogger();
      const error = new Error('Test error');
      
      logger.log('error', 'An error occurred', { error });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.name).toBe('Error');
      expect(logEntry.error.message).toBe('Test error');
      expect(logEntry.error.stack).toBeDefined();
    });
    
    it('should handle all log levels', () => {
      const logger = new StructuredLogger();
      
      logger.log('info', 'Info message');
      logger.log('warn', 'Warn message');
      logger.log('error', 'Error message');
      logger.log('debug', 'Debug message');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      
      const infoEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const warnEntry = JSON.parse(consoleLogSpy.mock.calls[1][0]);
      const errorEntry = JSON.parse(consoleLogSpy.mock.calls[2][0]);
      const debugEntry = JSON.parse(consoleLogSpy.mock.calls[3][0]);
      
      expect(infoEntry.level).toBe('info');
      expect(warnEntry.level).toBe('warn');
      expect(errorEntry.level).toBe('error');
      expect(debugEntry.level).toBe('debug');
    });
  });
  
  describe('info', () => {
    it('should log info message', () => {
      const logger = new StructuredLogger();
      
      logger.info('Info message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Info message');
    });
    
    it('should include context', () => {
      const logger = new StructuredLogger();
      
      logger.info('Info message', { key: 'value' });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.key).toBe('value');
    });
  });
  
  describe('warn', () => {
    it('should log warn message', () => {
      const logger = new StructuredLogger();
      
      logger.warn('Warning message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('warn');
      expect(logEntry.message).toBe('Warning message');
    });
    
    it('should include context', () => {
      const logger = new StructuredLogger();
      
      logger.warn('Warning message', { key: 'value' });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.key).toBe('value');
    });
  });
  
  describe('error', () => {
    it('should log error message', () => {
      const logger = new StructuredLogger();
      
      logger.error('Error message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('error');
      expect(logEntry.message).toBe('Error message');
    });
    
    it('should include context', () => {
      const logger = new StructuredLogger();
      
      logger.error('Error message', { key: 'value' });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.key).toBe('value');
    });
    
    it('should serialize error objects', () => {
      const logger = new StructuredLogger();
      const error = new Error('Test error');
      
      logger.error('Error occurred', { error });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.error.name).toBe('Error');
      expect(logEntry.error.message).toBe('Test error');
      expect(logEntry.error.stack).toBeDefined();
    });
  });
  
  describe('debug', () => {
    it('should log debug message', () => {
      const logger = new StructuredLogger();
      
      logger.debug('Debug message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('debug');
      expect(logEntry.message).toBe('Debug message');
    });
    
    it('should include context', () => {
      const logger = new StructuredLogger();
      
      logger.debug('Debug message', { key: 'value' });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.key).toBe('value');
    });
  });
  
  describe('timestamp format', () => {
    it('should use ISO 8601 format', () => {
      const logger = new StructuredLogger();
      
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const timestamp = logEntry.timestamp;
      
      // Should be valid ISO 8601 format
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });
  
  describe('component field', () => {
    it('should include component when provided', () => {
      const logger = new StructuredLogger('MyComponent');
      
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('MyComponent');
    });
    
    it('should not include component when not provided', () => {
      const logger = new StructuredLogger();
      
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBeUndefined();
    });
  });
  
  describe('complex context', () => {
    it('should handle nested objects', () => {
      const logger = new StructuredLogger();
      
      logger.info('Test message', {
        user: {
          id: '123',
          name: 'John',
        },
        metadata: {
          timestamp: Date.now(),
        },
      });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.user.id).toBe('123');
      expect(logEntry.user.name).toBe('John');
      expect(logEntry.metadata.timestamp).toBeDefined();
    });
    
    it('should handle arrays', () => {
      const logger = new StructuredLogger();
      
      logger.info('Test message', {
        items: ['item1', 'item2', 'item3'],
      });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.items).toEqual(['item1', 'item2', 'item3']);
    });
  });
});
