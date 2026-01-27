import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CodePipelineClient,
  StartPipelineExecutionCommand,
} from '@aws-sdk/client-codepipeline';
import {
  SNSClient,
  PublishCommand,
} from '@aws-sdk/client-sns';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import {
  RollbackOrchestrator,
  Deployment,
  RollbackResult,
} from '../../lib/components/rollback-orchestrator';
import { DeploymentStateManager } from '../../lib/components/deployment-state-manager';
import { HealthCheckMonitor } from '../../lib/components/health-check-monitor';

// Mock AWS SDK clients
const codepipelineMock = mockClient(CodePipelineClient);
const snsMock = mockClient(SNSClient);
const s3Mock = mockClient(S3Client);

// Mock DeploymentStateManager
vi.mock('../../lib/components/deployment-state-manager', () => ({
  DeploymentStateManager: vi.fn().mockImplementation(() => ({
    getLastKnownGoodDeployment: vi.fn(),
  })),
}));

// Mock HealthCheckMonitor
vi.mock('../../lib/components/health-check-monitor', () => ({
  HealthCheckMonitor: vi.fn().mockImplementation(() => ({
    monitorHealthChecks: vi.fn(),
  })),
}));

describe('RollbackOrchestrator', () => {
  let orchestrator: RollbackOrchestrator;
  let mockDeploymentStateManager: any;
  let mockHealthCheckMonitor: any;
  
  const config = {
    tableName: 'test-deployments-table',
    topicArn: 'arn:aws:sns:us-east-1:123456789012:test-topic',
    artifactsBucket: 'test-artifacts-bucket',
    region: 'us-east-1',
  };
  
  const testDeployment: Deployment = {
    deploymentId: 'test#1234567890',
    environment: 'test',
    version: 'abc123',
    previousVersion: 'xyz789',
    infrastructureChanged: false,
    pipelineExecutionId: 'exec-123',
  };
  
  beforeEach(() => {
    // Reset all mocks
    codepipelineMock.reset();
    snsMock.reset();
    s3Mock.reset();
    vi.clearAllMocks();
    
    // Create orchestrator
    orchestrator = new RollbackOrchestrator(config);
    
    // Get mock instances
    mockDeploymentStateManager = (DeploymentStateManager as any).mock.results[0].value;
    
    // Setup default mock responses
    snsMock.on(PublishCommand).resolves({});
    s3Mock.on(GetObjectCommand).resolves({});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('executeRollback', () => {
    it('should perform stage-level rollback first', async () => {
      // Mock successful stage rollback
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await orchestrator.executeRollback(testDeployment, 'Test failure');
      
      expect(result.success).toBe(true);
      expect(result.level).toBe('stage');
      expect(result.duration).toBeGreaterThan(0);
    });
    
    it('should fall back to full rollback when stage rollback fails', async () => {
      // Mock failed stage rollback, successful full rollback
      let callCount = 0;
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call (stage rollback) fails
            return Promise.resolve({
              success: false,
              failedAlarms: [{ name: 'test-alarm', state: 'ALARM' }],
              duration: 5000,
              reason: 'Alarm in ALARM state',
            });
          } else {
            // Subsequent calls (full rollback) succeed
            return Promise.resolve({
              success: true,
              failedAlarms: [],
              duration: 5000,
            });
          }
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      // Mock last known good deployment
      mockDeploymentStateManager.getLastKnownGoodDeployment.mockResolvedValue({
        deploymentId: 'prod#1234567890',
        environment: 'production',
        version: 'good123',
        status: 'succeeded',
      });
      
      const result = await orchestrator.executeRollback(testDeployment, 'Test failure');
      
      expect(result.success).toBe(true);
      expect(result.level).toBe('full');
    });
    
    it('should return failure when both rollback attempts fail', async () => {
      // Mock all rollbacks failing
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: false,
          failedAlarms: [{ name: 'test-alarm', state: 'ALARM' }],
          duration: 5000,
          reason: 'Alarm in ALARM state',
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      // Mock last known good deployment
      mockDeploymentStateManager.getLastKnownGoodDeployment.mockResolvedValue({
        deploymentId: 'prod#1234567890',
        environment: 'production',
        version: 'good123',
        status: 'succeeded',
      });
      
      const result = await orchestrator.executeRollback(testDeployment, 'Test failure');
      
      expect(result.success).toBe(false);
      expect(result.level).toBe('none');
      expect(result.reason).toContain('Stage rollback failed');
    });
    
    it('should send notifications at each rollback stage', async () => {
      // Mock successful stage rollback
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      await orchestrator.executeRollback(testDeployment, 'Test failure');
      
      // Should send 2 notifications: start and success
      expect(snsMock.calls()).toHaveLength(2);
      
      // Check start notification
      const startCall = snsMock.call(0);
      expect(startCall.args[0].input).toMatchObject({
        TopicArn: config.topicArn,
        Subject: expect.stringContaining('Rollback Initiated'),
      });
      
      // Check success notification
      const successCall = snsMock.call(1);
      expect(successCall.args[0].input).toMatchObject({
        TopicArn: config.topicArn,
        Subject: expect.stringContaining('Rollback Succeeded'),
      });
    });
    
    it('should handle errors and send failure notification', async () => {
      // Mock S3 error
      s3Mock.on(GetObjectCommand).rejects(new Error('S3 error'));
      
      await expect(orchestrator.executeRollback(testDeployment, 'Test failure')).rejects.toThrow();
      
      // Should send failure notification
      const failureCalls = snsMock.calls().filter(call => 
        call.args[0].input.Subject?.includes('Rollback Failed')
      );
      expect(failureCalls.length).toBeGreaterThan(0);
    });
  });
  
  describe('rollbackStage', () => {
    it('should rollback single environment successfully', async () => {
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await orchestrator.rollbackStage(testDeployment);
      
      expect(result.success).toBe(true);
      expect(result.level).toBe('stage');
      expect(result.duration).toBeGreaterThan(0);
    });
    
    it('should return failure when artifacts not found', async () => {
      // Mock S3 error (artifacts not found)
      s3Mock.on(GetObjectCommand).rejects(new Error('NoSuchKey'));
      
      const result = await orchestrator.rollbackStage(testDeployment);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('artifacts not found');
    });
    
    it('should rollback infrastructure when infrastructureChanged is true', async () => {
      const deploymentWithInfraChange: Deployment = {
        ...testDeployment,
        infrastructureChanged: true,
      };
      
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await orchestrator.rollbackStage(deploymentWithInfraChange);
      
      expect(result.success).toBe(true);
      // Infrastructure rollback would be called (placeholder in implementation)
    });
    
    it('should return failure when validation fails', async () => {
      // Mock failed health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: false,
          failedAlarms: [{ name: 'test-alarm', state: 'ALARM' }],
          duration: 5000,
          reason: 'Alarm in ALARM state',
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await orchestrator.rollbackStage(testDeployment);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Alarm in ALARM state');
    });
  });
  
  describe('rollbackFull', () => {
    it('should rollback all environments in correct order', async () => {
      // Mock successful health checks
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      // Mock last known good deployment
      mockDeploymentStateManager.getLastKnownGoodDeployment.mockResolvedValue({
        deploymentId: 'prod#1234567890',
        environment: 'production',
        version: 'good123',
        status: 'succeeded',
      });
      
      const result = await orchestrator.rollbackFull(testDeployment);
      
      expect(result.success).toBe(true);
      expect(result.level).toBe('full');
      
      // Should call health check monitor 3 times (once per environment)
      expect(mockHealthCheckMonitor.monitorHealthChecks).toHaveBeenCalledTimes(3);
    });
    
    it('should return failure when no last known good deployment found', async () => {
      // Mock no last known good deployment
      mockDeploymentStateManager.getLastKnownGoodDeployment.mockResolvedValue(null);
      
      const result = await orchestrator.rollbackFull(testDeployment);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('No last known good deployment found');
    });
    
    it('should stop and return failure when any environment rollback fails', async () => {
      // Mock health checks: production succeeds, staging fails
      let callCount = 0;
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Production succeeds
            return Promise.resolve({
              success: true,
              failedAlarms: [],
              duration: 5000,
            });
          } else {
            // Staging fails
            return Promise.resolve({
              success: false,
              failedAlarms: [{ name: 'staging-alarm', state: 'ALARM' }],
              duration: 5000,
              reason: 'Alarm in ALARM state',
            });
          }
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      // Mock last known good deployment
      mockDeploymentStateManager.getLastKnownGoodDeployment.mockResolvedValue({
        deploymentId: 'prod#1234567890',
        environment: 'production',
        version: 'good123',
        status: 'succeeded',
      });
      
      const result = await orchestrator.rollbackFull(testDeployment);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Failed to rollback staging');
    });
  });
  
  describe('validateRollback', () => {
    it('should validate rollback successfully', async () => {
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await orchestrator.validateRollback('test');
      
      expect(result.success).toBe(true);
    });
    
    it('should return failure when health checks fail', async () => {
      // Mock failed health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: false,
          failedAlarms: [{ name: 'test-alarm', state: 'ALARM' }],
          duration: 5000,
          reason: 'Health checks failed',
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      const result = await orchestrator.validateRollback('test');
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Health checks failed');
    });
  });
  
  describe('notification methods', () => {
    it('should handle SNS publish errors gracefully', async () => {
      // Mock SNS error
      snsMock.on(PublishCommand).rejects(new Error('SNS error'));
      
      // Mock successful health check
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockResolvedValue({
          success: true,
          failedAlarms: [],
          duration: 5000,
        }),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      // Should not throw error even if SNS fails
      const result = await orchestrator.executeRollback(testDeployment, 'Test failure');
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('error handling', () => {
    it('should handle unexpected errors during rollback', async () => {
      // Mock unexpected error
      mockHealthCheckMonitor = {
        monitorHealthChecks: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      };
      
      (HealthCheckMonitor as any).mockImplementation(() => mockHealthCheckMonitor);
      
      await expect(orchestrator.executeRollback(testDeployment, 'Test failure')).rejects.toThrow(
        'Rollback orchestration failed'
      );
    });
  });
});
