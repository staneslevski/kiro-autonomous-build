import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';
import { HealthCheckMonitor, AlarmInfo, HealthCheckResult } from '../../lib/components/health-check-monitor';

// Mock CloudWatch client
const cloudWatchMock = mockClient(CloudWatchClient);

describe('HealthCheckMonitor', () => {
  let monitor: HealthCheckMonitor;
  const testAlarmNames = ['test-alarm-1', 'test-alarm-2', 'test-alarm-3'];
  
  beforeEach(() => {
    cloudWatchMock.reset();
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Mock console.log to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    
    monitor = new HealthCheckMonitor(testAlarmNames, 'us-east-1');
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  
  describe('constructor', () => {
    it('should create monitor with alarm names and region', () => {
      const customMonitor = new HealthCheckMonitor(['alarm-1'], 'us-west-2');
      expect(customMonitor).toBeInstanceOf(HealthCheckMonitor);
    });
  });
  
  describe('checkAlarms', () => {
    it('should return empty array when no alarms configured', async () => {
      const emptyMonitor = new HealthCheckMonitor([], 'us-east-1');
      const result = await emptyMonitor.checkAlarms();
      
      expect(result).toEqual([]);
      expect(cloudWatchMock.calls()).toHaveLength(0);
    });
    
    it('should query CloudWatch and return alarm states', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'OK',
            StateReason: 'Threshold not breached',
          },
          {
            AlarmName: 'test-alarm-2',
            StateValue: 'OK',
            StateReason: 'Threshold not breached',
          },
          {
            AlarmName: 'test-alarm-3',
            StateValue: 'INSUFFICIENT_DATA',
            StateReason: 'Not enough data',
          },
        ],
      });
      
      const result = await monitor.checkAlarms();
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'test-alarm-1',
        state: 'OK',
        reason: 'Threshold not breached',
      });
      expect(result[1]).toEqual({
        name: 'test-alarm-2',
        state: 'OK',
        reason: 'Threshold not breached',
      });
      expect(result[2]).toEqual({
        name: 'test-alarm-3',
        state: 'INSUFFICIENT_DATA',
        reason: 'Not enough data',
      });
    });
    
    it('should handle alarms in ALARM state', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'ALARM',
            StateReason: 'Threshold breached',
          },
        ],
      });
      
      const result = await monitor.checkAlarms();
      
      expect(result).toHaveLength(1);
      expect(result[0].state).toBe('ALARM');
    });
    
    it('should throw error when CloudWatch API fails', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).rejects(new Error('API Error'));
      
      await expect(monitor.checkAlarms()).rejects.toThrow('Failed to check alarms: API Error');
    });
    
    it('should handle empty response from CloudWatch', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [],
      });
      
      const result = await monitor.checkAlarms();
      
      expect(result).toEqual([]);
    });
  });
  
  describe('runHealthChecks', () => {
    it('should return success for placeholder implementation', async () => {
      const result = await monitor.runHealthChecks();
      
      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });
  
  describe('monitorHealthChecks', () => {
    it('should run for full duration when all alarms OK', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'OK',
            StateReason: 'Threshold not breached',
          },
        ],
      });
      
      const duration = 60000; // 1 minute
      const monitorPromise = monitor.monitorHealthChecks(duration);
      
      // Advance time to complete monitoring
      await vi.advanceTimersByTimeAsync(duration);
      
      const result = await monitorPromise;
      
      expect(result.success).toBe(true);
      expect(result.failedAlarms).toEqual([]);
      expect(result.duration).toBeGreaterThanOrEqual(duration);
    });
    
    it('should stop early when alarm enters ALARM state', async () => {
      // First check: OK
      cloudWatchMock.on(DescribeAlarmsCommand).resolvesOnce({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'OK',
            StateReason: 'Threshold not breached',
          },
        ],
      });
      
      // Second check: ALARM
      cloudWatchMock.on(DescribeAlarmsCommand).resolvesOnce({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'ALARM',
            StateReason: 'Threshold breached',
          },
        ],
      });
      
      const duration = 300000; // 5 minutes
      const monitorPromise = monitor.monitorHealthChecks(duration);
      
      // Advance time to first check (30 seconds)
      await vi.advanceTimersByTimeAsync(30000);
      
      const result = await monitorPromise;
      
      expect(result.success).toBe(false);
      expect(result.failedAlarms).toHaveLength(1);
      expect(result.failedAlarms[0].name).toBe('test-alarm-1');
      expect(result.failedAlarms[0].state).toBe('ALARM');
      expect(result.reason).toBe('1 alarm(s) in ALARM state');
      expect(result.duration).toBeLessThan(duration);
    });
    
    it('should check alarms at 30-second intervals', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'OK',
            StateReason: 'Threshold not breached',
          },
        ],
      });
      
      const duration = 90000; // 1.5 minutes
      const monitorPromise = monitor.monitorHealthChecks(duration);
      
      // Advance time to complete monitoring
      await vi.advanceTimersByTimeAsync(duration);
      
      await monitorPromise;
      
      // Should have checked at: 0s, 30s, 60s = 3 times (last check at 90s doesn't happen because we're at end)
      expect(cloudWatchMock.calls()).toHaveLength(3);
    });
    
    it('should handle multiple failed alarms', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'ALARM',
            StateReason: 'High error rate',
          },
          {
            AlarmName: 'test-alarm-2',
            StateValue: 'ALARM',
            StateReason: 'High latency',
          },
          {
            AlarmName: 'test-alarm-3',
            StateValue: 'OK',
            StateReason: 'Normal',
          },
        ],
      });
      
      const monitorPromise = monitor.monitorHealthChecks(60000);
      
      // Advance time slightly to trigger first check
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await monitorPromise;
      
      expect(result.success).toBe(false);
      expect(result.failedAlarms).toHaveLength(2);
      expect(result.failedAlarms[0].name).toBe('test-alarm-1');
      expect(result.failedAlarms[1].name).toBe('test-alarm-2');
      expect(result.reason).toBe('2 alarm(s) in ALARM state');
    });
    
    it('should use default duration of 5 minutes', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'OK',
            StateReason: 'Normal',
          },
        ],
      });
      
      const monitorPromise = monitor.monitorHealthChecks(); // No duration specified
      
      // Advance time by 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      
      const result = await monitorPromise;
      
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(5 * 60 * 1000);
    });
    
    it('should throw error when CloudWatch check fails', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).rejects(new Error('CloudWatch API error'));
      
      const monitorPromise = monitor.monitorHealthChecks(60000);
      
      // Advance time slightly to trigger first check and wait for promise to reject
      const advancePromise = vi.advanceTimersByTimeAsync(100);
      
      await expect(monitorPromise).rejects.toThrow('Health check monitoring failed: Failed to check alarms: CloudWatch API error');
      await advancePromise;
    });
    
    it('should log structured messages during monitoring', async () => {
      const logSpy = vi.spyOn(console, 'log');
      
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'OK',
            StateReason: 'Normal',
          },
        ],
      });
      
      const monitorPromise = monitor.monitorHealthChecks(60000);
      
      // Advance time to complete
      await vi.advanceTimersByTimeAsync(60000);
      
      await monitorPromise;
      
      // Verify structured logging was called
      expect(logSpy).toHaveBeenCalled();
      
      // Check that logs are JSON formatted
      const logCalls = logSpy.mock.calls;
      logCalls.forEach(call => {
        const logEntry = JSON.parse(call[0] as string);
        expect(logEntry).toHaveProperty('timestamp');
        expect(logEntry).toHaveProperty('level');
        expect(logEntry).toHaveProperty('message');
        expect(logEntry).toHaveProperty('component', 'HealthCheckMonitor');
      });
    });
    
    it('should handle INSUFFICIENT_DATA alarm state as non-failure', async () => {
      cloudWatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'test-alarm-1',
            StateValue: 'INSUFFICIENT_DATA',
            StateReason: 'Not enough data points',
          },
        ],
      });
      
      const monitorPromise = monitor.monitorHealthChecks(60000);
      
      // Advance time to complete
      await vi.advanceTimersByTimeAsync(60000);
      
      const result = await monitorPromise;
      
      expect(result.success).toBe(true);
      expect(result.failedAlarms).toEqual([]);
    });
  });
});
