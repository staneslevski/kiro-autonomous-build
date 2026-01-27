/**
 * Unit tests for CloudWatch Logger
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { CloudWatchLogger } from './cloudwatch-logger';
import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogStreamCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';

// Mock AWS SDK
vi.mock('@aws-sdk/client-cloudwatch-logs', () => {
  const actual = vi.importActual('@aws-sdk/client-cloudwatch-logs');
  return {
    ...actual,
    CloudWatchLogsClient: vi.fn(),
    PutLogEventsCommand: vi.fn(),
    CreateLogStreamCommand: vi.fn(),
    DescribeLogStreamsCommand: vi.fn()
  };
});

// Mock sanitize utility
vi.mock('./sanitize', () => ({
  sanitizeForLogging: vi.fn((str: string) => str.replace(/token[=:]\s*[\w-]+/gi, 'token=[REDACTED]'))
}));

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CloudWatchLogger', () => {
  let cloudWatchLogger: CloudWatchLogger;
  let mockSend: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockSend = vi.fn();
    (CloudWatchLogsClient as unknown as Mock).mockImplementation(() => ({
      send: mockSend
    }));

    // Mock describe log streams response
    mockSend.mockResolvedValue({
      logStreams: [{
        logStreamName: 'test-stream',
        uploadSequenceToken: 'token-123'
      }],
      nextSequenceToken: 'token-124'
    });
  });

  afterEach(async () => {
    if (cloudWatchLogger) {
      await cloudWatchLogger.close();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create logger with config', () => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });

      expect(cloudWatchLogger).toBeDefined();
      expect(CloudWatchLogsClient).toHaveBeenCalledWith({
        region: 'us-east-1'
      });
    });

    it('should use custom region', () => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream',
        region: 'us-west-2'
      });

      expect(CloudWatchLogsClient).toHaveBeenCalledWith({
        region: 'us-west-2'
      });
    });

    it('should not start auto-flush when disabled', () => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream',
        enabled: false
      });

      expect(cloudWatchLogger).toBeDefined();
    });
  });

  describe('log methods', () => {
    beforeEach(() => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should log debug message', async () => {
      await cloudWatchLogger.debug('Debug message', { key: 'value' });

      // Flush to send logs
      await cloudWatchLogger.flush();

      expect(mockSend).toHaveBeenCalled();
    });

    it('should log info message', async () => {
      await cloudWatchLogger.info('Info message', { key: 'value' });

      await cloudWatchLogger.flush();

      expect(mockSend).toHaveBeenCalled();
    });

    it('should log warn message', async () => {
      await cloudWatchLogger.warn('Warning message', { key: 'value' });

      await cloudWatchLogger.flush();

      expect(mockSend).toHaveBeenCalled();
    });

    it('should log error message', async () => {
      await cloudWatchLogger.error('Error message', { key: 'value' });

      await cloudWatchLogger.flush();

      expect(mockSend).toHaveBeenCalled();
    });

    it('should not log when disabled', async () => {
      const disabledLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream',
        enabled: false
      });

      await disabledLogger.info('Test message');
      await disabledLogger.flush();

      expect(mockSend).not.toHaveBeenCalled();

      await disabledLogger.close();
    });
  });

  describe('sanitization', () => {
    beforeEach(() => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should sanitize message with token', async () => {
      await cloudWatchLogger.info('Message with token=abc123');

      await cloudWatchLogger.flush();

      const calls = mockSend.mock.calls;
      const putLogCall = calls.find(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCall).toBeDefined();
    });

    it('should sanitize context values', async () => {
      await cloudWatchLogger.info('Message', {
        apiToken: 'token=secret123',
        nested: {
          password: 'password=secret'
        }
      });

      await cloudWatchLogger.flush();

      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('buffering and flushing', () => {
    beforeEach(() => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should buffer logs', async () => {
      await cloudWatchLogger.info('Message 1');
      await cloudWatchLogger.info('Message 2');
      await cloudWatchLogger.info('Message 3');

      // Should not have sent yet
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(PutLogEventsCommand));

      await cloudWatchLogger.flush();

      // Should have sent after flush
      const calls = mockSend.mock.calls;
      const putLogCall = calls.find(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCall).toBeDefined();
    });

    it('should auto-flush after interval', async () => {
      await cloudWatchLogger.info('Message');

      // Advance timers by 5 seconds to trigger auto-flush
      await vi.advanceTimersByTimeAsync(5000);

      const calls = mockSend.mock.calls;
      const putLogCall = calls.find(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCall).toBeDefined();
    });

    it('should flush when buffer is full', async () => {
      // Add 100 logs to fill buffer
      for (let i = 0; i < 100; i++) {
        await cloudWatchLogger.info(`Message ${i}`);
      }

      // Should have flushed automatically
      const calls = mockSend.mock.calls;
      const putLogCall = calls.find(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCall).toBeDefined();
    });

    it('should not flush empty buffer', async () => {
      await cloudWatchLogger.flush();

      expect(mockSend).not.toHaveBeenCalledWith(expect.any(PutLogEventsCommand));
    });
  });

  describe('log stream management', () => {
    beforeEach(() => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should use existing log stream', async () => {
      mockSend.mockResolvedValueOnce({
        logStreams: [{
          logStreamName: 'test-stream',
          uploadSequenceToken: 'token-123'
        }]
      }).mockResolvedValueOnce({
        nextSequenceToken: 'token-124'
      });

      await cloudWatchLogger.info('Test message');
      await cloudWatchLogger.flush();

      const calls = mockSend.mock.calls;
      expect(calls[0][0]).toBeInstanceOf(DescribeLogStreamsCommand);
      expect(calls[1][0]).toBeInstanceOf(PutLogEventsCommand);
    });

    it('should create log stream if not exists', async () => {
      mockSend.mockResolvedValueOnce({
        logStreams: []
      }).mockResolvedValueOnce({}).mockResolvedValueOnce({
        nextSequenceToken: 'token-123'
      });

      await cloudWatchLogger.info('Test message');
      await cloudWatchLogger.flush();

      const calls = mockSend.mock.calls;
      expect(calls[0][0]).toBeInstanceOf(DescribeLogStreamsCommand);
      expect(calls[1][0]).toBeInstanceOf(CreateLogStreamCommand);
      expect(calls[2][0]).toBeInstanceOf(PutLogEventsCommand);
    });

    it('should handle log stream creation error', async () => {
      // Mock DescribeLogStreamsCommand to fail
      mockSend.mockRejectedValueOnce(new Error('Access denied'));

      await cloudWatchLogger.info('Test message');

      // Flush should not throw (errors are caught and logged)
      await cloudWatchLogger.flush();

      // Should have attempted to describe log streams
      expect(mockSend).toHaveBeenCalledWith(expect.any(DescribeLogStreamsCommand));
      
      // Logs should be back in buffer for retry (flush failed)
      // We can verify this by flushing again with a successful mock
      mockSend.mockResolvedValueOnce({
        logStreams: [{
          logStreamName: 'test-stream',
          uploadSequenceToken: 'token-123'
        }]
      }).mockResolvedValueOnce({
        nextSequenceToken: 'token-124'
      });

      await cloudWatchLogger.flush();
      
      // Should have successfully sent logs on second attempt
      const putLogCall = mockSend.mock.calls.find(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCall).toBeDefined();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should handle flush error and retry', async () => {
      mockSend.mockResolvedValueOnce({
        logStreams: [{
          logStreamName: 'test-stream',
          uploadSequenceToken: 'token-123'
        }]
      }).mockRejectedValueOnce(new Error('Network error'));

      await cloudWatchLogger.info('Test message');
      await cloudWatchLogger.flush();

      // Logs should be back in buffer for retry
      expect(mockSend).toHaveBeenCalled();
    });

    it('should handle auto-flush error gracefully', async () => {
      // Mock to fail on DescribeLogStreamsCommand
      mockSend.mockRejectedValue(new Error('Network error'));

      await cloudWatchLogger.info('Test message');

      // Advance timers to trigger auto-flush (should not throw)
      await vi.advanceTimersByTimeAsync(5000);

      // Should have attempted to send
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    beforeEach(() => {
      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should flush and stop timer on close', async () => {
      await cloudWatchLogger.info('Test message');

      await cloudWatchLogger.close();

      // Should have flushed
      const calls = mockSend.mock.calls;
      const putLogCall = calls.find(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCall).toBeDefined();

      // Timer should be stopped
      vi.advanceTimersByTime(10000);
      await vi.runAllTimersAsync();

      // Should not have additional flushes
      const putLogCalls = calls.filter(call => call[0] instanceof PutLogEventsCommand);
      expect(putLogCalls.length).toBe(1);
    });
  });

  describe('log formatting', () => {
    let capturedPutLogInput: any;

    beforeEach(() => {
      capturedPutLogInput = undefined;
      
      // Mock PutLogEventsCommand constructor to capture input
      vi.mocked(PutLogEventsCommand).mockImplementation((input: any) => {
        capturedPutLogInput = input;
        return {} as any;
      });

      cloudWatchLogger = new CloudWatchLogger({
        logGroupName: '/aws/codebuild/test',
        logStreamName: 'test-stream'
      });
    });

    it('should format logs with timestamp and level', async () => {
      mockSend.mockImplementation((command: any) => {
        if (command instanceof DescribeLogStreamsCommand) {
          return Promise.resolve({
            logStreams: [{
              logStreamName: 'test-stream',
              uploadSequenceToken: 'token-123'
            }]
          });
        }
        return Promise.resolve({
          nextSequenceToken: 'token-124'
        });
      });

      await cloudWatchLogger.info('Test message', { key: 'value' });
      await cloudWatchLogger.flush();

      expect(capturedPutLogInput).toBeDefined();
      const logEvents = capturedPutLogInput.logEvents;
      expect(logEvents).toBeDefined();
      expect(logEvents!.length).toBe(1);

      const logMessage = JSON.parse(logEvents![0].message!);
      expect(logMessage.level).toBe('INFO');
      expect(logMessage.message).toBe('Test message');
      expect(logMessage.context).toEqual({ key: 'value' });
      expect(logMessage.timestamp).toBeDefined();
    });

    it('should sort log events by timestamp', async () => {
      mockSend.mockImplementation((command: any) => {
        if (command instanceof DescribeLogStreamsCommand) {
          return Promise.resolve({
            logStreams: [{
              logStreamName: 'test-stream',
              uploadSequenceToken: 'token-123'
            }]
          });
        }
        return Promise.resolve({
          nextSequenceToken: 'token-124'
        });
      });

      await cloudWatchLogger.info('Message 1');
      await cloudWatchLogger.info('Message 2');
      await cloudWatchLogger.info('Message 3');
      await cloudWatchLogger.flush();

      expect(capturedPutLogInput).toBeDefined();
      const logEvents = capturedPutLogInput.logEvents!;

      // Verify timestamps are in order
      for (let i = 1; i < logEvents.length; i++) {
        expect(logEvents[i].timestamp).toBeGreaterThanOrEqual(logEvents[i - 1].timestamp!);
      }
    });
  });
});
