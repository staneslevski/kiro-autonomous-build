import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { PipelineMetrics, TestResults, RollbackLevel } from '../../lib/components/pipeline-metrics';

// Mock CloudWatch client
const cloudWatchMock = mockClient(CloudWatchClient);

describe('PipelineMetrics', () => {
  let metrics: PipelineMetrics;
  
  beforeEach(() => {
    cloudWatchMock.reset();
    vi.clearAllMocks();
    
    // Mock console.log to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    
    metrics = new PipelineMetrics('us-east-1');
  });
  
  describe('constructor', () => {
    it('should create metrics publisher with region', () => {
      const customMetrics = new PipelineMetrics('us-west-2');
      expect(customMetrics).toBeInstanceOf(PipelineMetrics);
    });
  });
  
  describe('publishDeploymentDuration', () => {
    it('should send correct metric with dimensions', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishDeploymentDuration('production', 1800);
      
      expect(cloudWatchMock.calls()).toHaveLength(1);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.Namespace).toBe('KiroPipeline');
      expect(input.MetricData).toHaveLength(1);
      expect(input.MetricData![0].MetricName).toBe('DeploymentDuration');
      expect(input.MetricData![0].Value).toBe(1800);
      expect(input.MetricData![0].Unit).toBe('Seconds');
      expect(input.MetricData![0].Dimensions).toEqual([
        { Name: 'Environment', Value: 'production' }
      ]);
      expect(input.MetricData![0].Timestamp).toBeInstanceOf(Date);
    });
    
    it('should handle different environments', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishDeploymentDuration('test', 600);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Dimensions).toEqual([
        { Name: 'Environment', Value: 'test' }
      ]);
      expect(input.MetricData![0].Value).toBe(600);
    });
    
    it('should handle errors gracefully without throwing', async () => {
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));
      
      // Should not throw
      await expect(metrics.publishDeploymentDuration('production', 1800)).resolves.toBeUndefined();
    });
    
    it('should log error when CloudWatch API fails', async () => {
      const logSpy = vi.spyOn(console, 'log');
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));
      
      await metrics.publishDeploymentDuration('production', 1800);
      
      // Check that error was logged
      const errorLogs = logSpy.mock.calls.filter(call => {
        const logEntry = JSON.parse(call[0] as string);
        return logEntry.level === 'error';
      });
      
      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });
  
  describe('publishRollback', () => {
    it('should send metric with environment and level dimensions', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishRollback('staging', 'stage');
      
      expect(cloudWatchMock.calls()).toHaveLength(1);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.Namespace).toBe('KiroPipeline');
      expect(input.MetricData).toHaveLength(1);
      expect(input.MetricData![0].MetricName).toBe('RollbackCount');
      expect(input.MetricData![0].Value).toBe(1);
      expect(input.MetricData![0].Unit).toBe('Count');
      expect(input.MetricData![0].Dimensions).toEqual([
        { Name: 'Environment', Value: 'staging' },
        { Name: 'Level', Value: 'stage' }
      ]);
      expect(input.MetricData![0].Timestamp).toBeInstanceOf(Date);
    });
    
    it('should handle full rollback level', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishRollback('production', 'full');
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Dimensions).toEqual([
        { Name: 'Environment', Value: 'production' },
        { Name: 'Level', Value: 'full' }
      ]);
    });
    
    it('should handle errors gracefully without throwing', async () => {
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));
      
      // Should not throw
      await expect(metrics.publishRollback('production', 'stage')).resolves.toBeUndefined();
    });
    
    it('should log error when CloudWatch API fails', async () => {
      // Restore the console.log mock from beforeEach
      vi.restoreAllMocks();
      
      // Create a new spy to capture error logs
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Reset the mock and configure it to reject
      cloudWatchMock.reset();
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));
      
      // Recreate metrics instance after restoring mocks
      const testMetrics = new PipelineMetrics('us-east-1');
      
      await testMetrics.publishRollback('production', 'stage');
      
      // Check that error was logged
      const errorLogs = logSpy.mock.calls.filter(call => {
        try {
          const logEntry = JSON.parse(call[0] as string);
          return logEntry.level === 'error';
        } catch {
          return false;
        }
      });
      
      expect(errorLogs.length).toBeGreaterThan(0);
      
      logSpy.mockRestore();
    });
  });
  
  describe('publishTestResults', () => {
    it('should calculate and send success rate percentage', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      const testResults: TestResults = {
        total: 100,
        passed: 85,
        failed: 10,
        skipped: 5,
      };
      
      await metrics.publishTestResults('unit', testResults);
      
      expect(cloudWatchMock.calls()).toHaveLength(1);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.Namespace).toBe('KiroPipeline');
      expect(input.MetricData).toHaveLength(1);
      expect(input.MetricData![0].MetricName).toBe('TestSuccessRate');
      expect(input.MetricData![0].Value).toBe(85); // 85/100 * 100 = 85%
      expect(input.MetricData![0].Unit).toBe('Percent');
      expect(input.MetricData![0].Dimensions).toEqual([
        { Name: 'TestType', Value: 'unit' }
      ]);
      expect(input.MetricData![0].Timestamp).toBeInstanceOf(Date);
    });
    
    it('should handle different test types', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      const testResults: TestResults = {
        total: 50,
        passed: 48,
        failed: 2,
        skipped: 0,
      };
      
      await metrics.publishTestResults('integration', testResults);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Dimensions).toEqual([
        { Name: 'TestType', Value: 'integration' }
      ]);
      expect(input.MetricData![0].Value).toBe(96); // 48/50 * 100 = 96%
    });
    
    it('should handle zero total tests', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      const testResults: TestResults = {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      };
      
      await metrics.publishTestResults('e2e', testResults);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Value).toBe(0); // 0% when no tests
    });
    
    it('should handle 100% success rate', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      const testResults: TestResults = {
        total: 100,
        passed: 100,
        failed: 0,
        skipped: 0,
      };
      
      await metrics.publishTestResults('unit', testResults);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Value).toBe(100);
    });
    
    it('should handle errors gracefully without throwing', async () => {
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));
      
      const testResults: TestResults = {
        total: 100,
        passed: 85,
        failed: 15,
        skipped: 0,
      };
      
      // Should not throw
      await expect(metrics.publishTestResults('unit', testResults)).resolves.toBeUndefined();
    });
    
    it('should log error when CloudWatch API fails', async () => {
      const logSpy = vi.spyOn(console, 'log');
      cloudWatchMock.on(PutMetricDataCommand).rejects(new Error('CloudWatch API error'));
      
      const testResults: TestResults = {
        total: 100,
        passed: 85,
        failed: 15,
        skipped: 0,
      };
      
      await metrics.publishTestResults('unit', testResults);
      
      // Check that error was logged
      const errorLogs = logSpy.mock.calls.filter(call => {
        const logEntry = JSON.parse(call[0] as string);
        return logEntry.level === 'error';
      });
      
      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });
  
  describe('metric namespace', () => {
    it('should use KiroPipeline namespace for all metrics', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishDeploymentDuration('test', 600);
      await metrics.publishRollback('test', 'stage');
      await metrics.publishTestResults('unit', { total: 10, passed: 10, failed: 0, skipped: 0 });
      
      expect(cloudWatchMock.calls()).toHaveLength(3);
      
      cloudWatchMock.calls().forEach(call => {
        const input = call.args[0].input;
        expect(input.Namespace).toBe('KiroPipeline');
      });
    });
  });
  
  describe('correct units', () => {
    it('should use Seconds for deployment duration', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishDeploymentDuration('test', 600);
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Unit).toBe('Seconds');
    });
    
    it('should use Count for rollback', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishRollback('test', 'stage');
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Unit).toBe('Count');
    });
    
    it('should use Percent for test results', async () => {
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishTestResults('unit', { total: 10, passed: 10, failed: 0, skipped: 0 });
      
      const call = cloudWatchMock.call(0);
      const input = call.args[0].input;
      
      expect(input.MetricData![0].Unit).toBe('Percent');
    });
  });
  
  describe('structured logging', () => {
    it('should log structured messages for successful operations', async () => {
      const logSpy = vi.spyOn(console, 'log');
      cloudWatchMock.on(PutMetricDataCommand).resolves({});
      
      await metrics.publishDeploymentDuration('production', 1800);
      
      // Check that info log was created
      const infoLogs = logSpy.mock.calls.filter(call => {
        const logEntry = JSON.parse(call[0] as string);
        return logEntry.level === 'info';
      });
      
      expect(infoLogs.length).toBeGreaterThan(0);
      
      const logEntry = JSON.parse(infoLogs[0][0] as string);
      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).toHaveProperty('level', 'info');
      expect(logEntry).toHaveProperty('message');
      expect(logEntry).toHaveProperty('component', 'PipelineMetrics');
    });
  });
});
