import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  RollbackValidator,
  ValidationResult,
} from '../../lib/components/rollback-validator';
import { HealthCheckMonitor } from '../../lib/components/health-check-monitor';

// Mock AWS SDK clients
const cloudwatchMock = mockClient(CloudWatchClient);

// Mock HealthCheckMonitor
vi.mock('../../lib/components/health-check-monitor', () => ({
  HealthCheckMonitor: vi.fn().mockImplementation(() => ({
    monitorHealthChecks: vi.fn(),
  })),
}));

describe('RollbackValidator', () => {
  let validator: RollbackValidator;
  let mockHealthCheckMonitor: any;
  
  const testAlarmNames = [
    'kiro-worker-test-build-failures',
    'kiro-worker-test-test-failures',
    'kiro-worker-test-high-error-rate',
  ];
  
  beforeEach(() => {
    // Reset all mocks
    cloudwatchMock.reset();
    vi.clearAllMocks();
    
    // Create validator with short durations for testing
    validator = new RollbackValidator({
      region: 'us-east-1',
      stabilizationWaitMs: 100, // 100ms for testing
      healthCheckDurationMs: 200, // 200ms for testing
    });
    
    // Setup default mock responses
    cloudwatchMock.on(DescribeAlarmsCommand).resolves({
      MetricAlarms: [
        {
          AlarmName: 'kiro-worker-test-build-failures',
          StateValue: 'OK',
          StateReason: 'Threshold not breached',
        },
        {
          AlarmName: 'kiro-worker-test-test-failures',
          StateValue: 'OK',
          StateReason: 'Threshold not breached',
        },
        {
          AlarmName: 'kiro-worker-test-high-error-rate',
          StateValue: 'OK',
          StateReason: 'Threshold not breached',
        },
      ],
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('validateRollback', () => {
    it('should succeed when all checks pass', async () => {
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 200,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.validateRollback('test', testAlarmNames);
      
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });
    
    it('should fail when alarms are in ALARM state', async () => {
      // Mock alarm in ALARM state
      cloudwatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'kiro-worker-test-build-failures',
            StateValue: 'ALARM',
            StateReason: 'Threshold breached',
          },
          {
            AlarmName: 'kiro-worker-test-test-failures',
            StateValue: 'OK',
            StateReason: 'Threshold not breached',
          },
        ],
      });
      
      const result = await validator.validateRollback('test', testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Alarms still in ALARM state');
      expect(result.reason).toContain('kiro-worker-test-build-failures');
    });
    
    it('should fail when health checks fail', async () => {
      // Mock failed health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: false,
          failedAlarms: [{ name: 'test-alarm', state: 'ALARM' }],
          duration: 200,
          reason: 'Health checks failed',
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.validateRollback('test', testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Health checks failed');
    });
    
    it('should verify version when provided', async () => {
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 200,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.validateRollback('test', testAlarmNames, 'v1.2.3');
      
      expect(result.success).toBe(true);
      // Version verification is placeholder, always succeeds
    });
    
    it('should wait for stabilization period before validation', async () => {
      const startTime = Date.now();
      
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 200,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      await validator.validateRollback('test', testAlarmNames);
      
      const duration = Date.now() - startTime;
      
      // Should wait at least stabilization period (100ms in test config)
      expect(duration).toBeGreaterThanOrEqual(100);
    });
    
    it('should handle errors during validation', async () => {
      // Mock CloudWatch error
      cloudwatchMock.on(DescribeAlarmsCommand).rejects(new Error('CloudWatch error'));
      
      const result = await validator.validateRollback('test', testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('CloudWatch error');
    });
  });
  
  describe('checkAlarms', () => {
    it('should succeed when all alarms are OK', async () => {
      const result = await validator.checkAlarms(testAlarmNames);
      
      expect(result.success).toBe(true);
    });
    
    it('should fail when any alarm is in ALARM state', async () => {
      cloudwatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'kiro-worker-test-build-failures',
            StateValue: 'ALARM',
            StateReason: 'Threshold breached',
          },
        ],
      });
      
      const result = await validator.checkAlarms(testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Alarms still in ALARM state');
    });
    
    it('should warn but not fail when alarms have insufficient data', async () => {
      cloudwatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'kiro-worker-test-build-failures',
            StateValue: 'INSUFFICIENT_DATA',
            StateReason: 'Not enough data',
          },
        ],
      });
      
      const result = await validator.checkAlarms(testAlarmNames);
      
      // Should succeed despite insufficient data
      expect(result.success).toBe(true);
    });
    
    it('should handle empty alarm list', async () => {
      const result = await validator.checkAlarms([]);
      
      expect(result.success).toBe(true);
    });
    
    it('should handle CloudWatch errors', async () => {
      cloudwatchMock.on(DescribeAlarmsCommand).rejects(new Error('CloudWatch error'));
      
      const result = await validator.checkAlarms(testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Failed to check alarms');
    });
  });
  
  describe('runHealthChecks', () => {
    it('should succeed when health checks pass', async () => {
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 200,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.runHealthChecks(testAlarmNames);
      
      expect(result.success).toBe(true);
    });
    
    it('should fail when health checks fail', async () => {
      // Mock failed health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: false,
          failedAlarms: [{ name: 'test-alarm', state: 'ALARM' }],
          duration: 200,
          reason: 'Alarm triggered',
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.runHealthChecks(testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Alarm triggered');
    });
    
    it('should handle health check errors', async () => {
      // Mock health check error
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockRejectedValue(new Error('Health check error')),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.runHealthChecks(testAlarmNames);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Health check error');
    });
  });
  
  describe('verifyVersion', () => {
    it('should succeed (placeholder implementation)', async () => {
      const result = await validator.verifyVersion('test', 'v1.2.3');
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('integration scenarios', () => {
    it('should perform complete validation flow', async () => {
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 200,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.validateRollback('test', testAlarmNames, 'v1.2.3');
      
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      
      // Should have called CloudWatch to check alarms
      expect(cloudwatchMock.calls()).toHaveLength(1);
      
      // Should have called health check monitor
      expect(mockHealthCheckMonitor.monitorHealthChecks).toHaveBeenCalledTimes(1);
    });
    
    it('should stop validation early when alarms fail', async () => {
      // Mock alarm in ALARM state
      cloudwatchMock.on(DescribeAlarmsCommand).resolves({
        MetricAlarms: [
          {
            AlarmName: 'kiro-worker-test-build-failures',
            StateValue: 'ALARM',
            StateReason: 'Threshold breached',
          },
        ],
      });
      
      // Mock health check (should not be called)
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 200,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await validator.validateRollback('test', testAlarmNames);
      
      expect(result.success).toBe(false);
      
      // Health check should not be called since alarm check failed
      expect(mockHealthCheckMonitor.monitorHealthChecks).not.toHaveBeenCalled();
    });
  });
});
