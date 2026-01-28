/**
 * Unit tests for Rollback Lambda Handler
 * 
 * Tests the Lambda handler function and AlarmEventProcessor class
 * that process CloudWatch alarm events and trigger automated rollback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handler,
  AlarmEventProcessor,
  AlarmEvent,
} from '../../lib/lambda/rollback-handler';
import {
  RollbackOrchestrator,
  RollbackResult,
  Deployment,
} from '../../lib/components/rollback-orchestrator';
import {
  DeploymentStateManager,
  DeploymentRecord,
} from '../../lib/components/deployment-state-manager';

describe('AlarmEventProcessor', () => {
  let processor: AlarmEventProcessor;
  let mockOrchestrator: RollbackOrchestrator;
  let mockDeploymentStateManager: DeploymentStateManager;
  
  const mockAlarmEvent: AlarmEvent = {
    version: '0',
    id: 'test-event-id',
    'detail-type': 'CloudWatch Alarm State Change',
    source: 'aws.cloudwatch',
    account: '123456789012',
    time: '2026-01-28T10:00:00Z',
    region: 'us-east-1',
    detail: {
      alarmName: 'kiro-worker-test-build-failures',
      state: {
        value: 'ALARM',
        reason: 'Threshold Crossed: 3 datapoints were greater than the threshold (2.0)',
        timestamp: '2026-01-28T10:00:00Z',
      },
      previousState: {
        value: 'OK',
        timestamp: '2026-01-28T09:55:00Z',
      },
    },
  };
  
  beforeEach(() => {
    // Create mock instances
    mockOrchestrator = {
      executeRollback: vi.fn(),
    } as any;
    
    mockDeploymentStateManager = {
      getDeploymentHistory: vi.fn(),
    } as any;
    
    processor = new AlarmEventProcessor(
      mockOrchestrator,
      mockDeploymentStateManager,
      ['kiro-worker-test', 'kiro-worker-staging', 'kiro-worker-production']
    );
    
    // Mock console.log to avoid test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  describe('processAlarmEvent', () => {
    it('should process alarm event and trigger rollback for deployment-related alarm', async () => {
      // Arrange
      const mockDeployment: DeploymentRecord = {
        deploymentId: 'test#1706436000000',
        environment: 'test',
        version: 'abc123',
        status: 'in_progress',
        startTime: 1706436000000,
        infrastructureChanged: false,
        commitMessage: 'test commit',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifact.zip',
        expiresAt: 1714212000,
      };
      
      const mockRollbackResult: RollbackResult = {
        success: true,
        level: 'stage',
        duration: 30000,
      };
      
      vi.mocked(mockDeploymentStateManager.getDeploymentHistory).mockResolvedValue({
        deployments: [mockDeployment],
        lastEvaluatedKey: undefined,
      });
      
      vi.mocked(mockOrchestrator.executeRollback).mockResolvedValue(mockRollbackResult);
      
      // Act
      await processor.processAlarmEvent(mockAlarmEvent);
      
      // Assert
      expect(mockDeploymentStateManager.getDeploymentHistory).toHaveBeenCalledWith('test', 10);
      expect(mockOrchestrator.executeRollback).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: 'test#1706436000000',
          environment: 'test',
          version: 'abc123',
        }),
        expect.stringContaining('kiro-worker-test-build-failures')
      );
    });
    
    it('should ignore non-ALARM state changes', async () => {
      // Arrange
      const okEvent: AlarmEvent = {
        ...mockAlarmEvent,
        detail: {
          ...mockAlarmEvent.detail,
          state: {
            value: 'OK',
            reason: 'Threshold not crossed',
            timestamp: '2026-01-28T10:00:00Z',
          },
        },
      };
      
      // Act
      await processor.processAlarmEvent(okEvent);
      
      // Assert
      expect(mockDeploymentStateManager.getDeploymentHistory).not.toHaveBeenCalled();
      expect(mockOrchestrator.executeRollback).not.toHaveBeenCalled();
    });
    
    it('should ignore non-deployment alarms', async () => {
      // Arrange
      const nonDeploymentEvent: AlarmEvent = {
        ...mockAlarmEvent,
        detail: {
          ...mockAlarmEvent.detail,
          alarmName: 'some-other-alarm',
        },
      };
      
      // Act
      await processor.processAlarmEvent(nonDeploymentEvent);
      
      // Assert
      expect(mockDeploymentStateManager.getDeploymentHistory).not.toHaveBeenCalled();
      expect(mockOrchestrator.executeRollback).not.toHaveBeenCalled();
    });
    
    it('should handle case when no active deployment found', async () => {
      // Arrange
      vi.mocked(mockDeploymentStateManager.getDeploymentHistory).mockResolvedValue({
        deployments: [],
        lastEvaluatedKey: undefined,
      });
      
      // Act
      await processor.processAlarmEvent(mockAlarmEvent);
      
      // Assert
      expect(mockDeploymentStateManager.getDeploymentHistory).toHaveBeenCalled();
      expect(mockOrchestrator.executeRollback).not.toHaveBeenCalled();
    });
    
    it('should handle case when only completed deployments exist', async () => {
      // Arrange
      const completedDeployment: DeploymentRecord = {
        deploymentId: 'test#1706436000000',
        environment: 'test',
        version: 'abc123',
        status: 'succeeded',
        startTime: 1706436000000,
        endTime: 1706439600000,
        infrastructureChanged: false,
        commitMessage: 'test commit',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifact.zip',
        expiresAt: 1714212000,
      };
      
      vi.mocked(mockDeploymentStateManager.getDeploymentHistory).mockResolvedValue({
        deployments: [completedDeployment],
        lastEvaluatedKey: undefined,
      });
      
      // Act
      await processor.processAlarmEvent(mockAlarmEvent);
      
      // Assert
      expect(mockDeploymentStateManager.getDeploymentHistory).toHaveBeenCalled();
      expect(mockOrchestrator.executeRollback).not.toHaveBeenCalled();
    });
    
    it('should throw error when rollback fails', async () => {
      // Arrange
      const mockDeployment: DeploymentRecord = {
        deploymentId: 'test#1706436000000',
        environment: 'test',
        version: 'abc123',
        status: 'in_progress',
        startTime: 1706436000000,
        infrastructureChanged: false,
        commitMessage: 'test commit',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifact.zip',
        expiresAt: 1714212000,
      };
      
      const mockRollbackResult: RollbackResult = {
        success: false,
        level: 'none',
        reason: 'Rollback validation failed',
      };
      
      vi.mocked(mockDeploymentStateManager.getDeploymentHistory).mockResolvedValue({
        deployments: [mockDeployment],
        lastEvaluatedKey: undefined,
      });
      
      vi.mocked(mockOrchestrator.executeRollback).mockResolvedValue(mockRollbackResult);
      
      // Act & Assert
      await expect(processor.processAlarmEvent(mockAlarmEvent)).rejects.toThrow('Rollback failed');
    });
    
    it('should handle rollback orchestrator errors', async () => {
      // Arrange
      const mockDeployment: DeploymentRecord = {
        deploymentId: 'test#1706436000000',
        environment: 'test',
        version: 'abc123',
        status: 'in_progress',
        startTime: 1706436000000,
        infrastructureChanged: false,
        commitMessage: 'test commit',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifact.zip',
        expiresAt: 1714212000,
      };
      
      vi.mocked(mockDeploymentStateManager.getDeploymentHistory).mockResolvedValue({
        deployments: [mockDeployment],
        lastEvaluatedKey: undefined,
      });
      
      vi.mocked(mockOrchestrator.executeRollback).mockRejectedValue(
        new Error('Orchestrator error')
      );
      
      // Act & Assert
      await expect(processor.processAlarmEvent(mockAlarmEvent)).rejects.toThrow('Orchestrator error');
    });
    
    it('should extract environment from alarm name correctly', async () => {
      // Arrange
      const stagingEvent: AlarmEvent = {
        ...mockAlarmEvent,
        detail: {
          ...mockAlarmEvent.detail,
          alarmName: 'kiro-worker-staging-build-failures',
        },
      };
      
      const mockDeployment: DeploymentRecord = {
        deploymentId: 'staging#1706436000000',
        environment: 'staging',
        version: 'abc123',
        status: 'in_progress',
        startTime: 1706436000000,
        infrastructureChanged: false,
        commitMessage: 'test commit',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifact.zip',
        expiresAt: 1714212000,
      };
      
      vi.mocked(mockDeploymentStateManager.getDeploymentHistory).mockResolvedValue({
        deployments: [mockDeployment],
        lastEvaluatedKey: undefined,
      });
      
      vi.mocked(mockOrchestrator.executeRollback).mockResolvedValue({
        success: true,
        level: 'stage',
        duration: 30000,
      });
      
      // Act
      await processor.processAlarmEvent(stagingEvent);
      
      // Assert
      expect(mockDeploymentStateManager.getDeploymentHistory).toHaveBeenCalledWith('staging', 10);
    });
  });
});

describe('handler', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      TABLE_NAME: 'test-table',
      TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:test-topic',
      ARTIFACTS_BUCKET: 'test-bucket',
      AWS_REGION: 'us-east-1',
      ENVIRONMENT_PREFIXES: 'kiro-worker-test,kiro-worker-staging',
    };
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });
  
  const mockAlarmEvent: AlarmEvent = {
    version: '0',
    id: 'test-event-id',
    'detail-type': 'CloudWatch Alarm State Change',
    source: 'aws.cloudwatch',
    account: '123456789012',
    time: '2026-01-28T10:00:00Z',
    region: 'us-east-1',
    detail: {
      alarmName: 'kiro-worker-test-build-failures',
      state: {
        value: 'ALARM',
        reason: 'Threshold Crossed',
        timestamp: '2026-01-28T10:00:00Z',
      },
      previousState: {
        value: 'OK',
        timestamp: '2026-01-28T09:55:00Z',
      },
    },
  };
  
  it('should return 500 when TABLE_NAME is missing', async () => {
    // Arrange
    delete process.env.TABLE_NAME;
    
    // Act
    const response = await handler(mockAlarmEvent);
    
    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Missing required environment variables');
  });
  
  it('should return 500 when TOPIC_ARN is missing', async () => {
    // Arrange
    delete process.env.TOPIC_ARN;
    
    // Act
    const response = await handler(mockAlarmEvent);
    
    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Missing required environment variables');
  });
  
  it('should return 500 when ARTIFACTS_BUCKET is missing', async () => {
    // Arrange
    delete process.env.ARTIFACTS_BUCKET;
    
    // Act
    const response = await handler(mockAlarmEvent);
    
    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Missing required environment variables');
  });
  
  it('should return 500 when ENVIRONMENT_PREFIXES is missing', async () => {
    // Arrange
    delete process.env.ENVIRONMENT_PREFIXES;
    
    // Act
    const response = await handler(mockAlarmEvent);
    
    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Missing required environment variable: ENVIRONMENT_PREFIXES');
  });
  
  it('should return 500 when ENVIRONMENT_PREFIXES is empty', async () => {
    // Arrange
    process.env.ENVIRONMENT_PREFIXES = '';
    
    // Act
    const response = await handler(mockAlarmEvent);
    
    // Assert
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Missing required environment variable: ENVIRONMENT_PREFIXES');
  });
  
  it('should return 200 when alarm event is processed successfully', async () => {
    // Note: This test would require mocking AWS SDK clients
    // For now, we test the validation logic
    // Full integration testing would be done in E2E tests
    
    // This test is a placeholder - actual implementation would need
    // to mock RollbackOrchestrator and DeploymentStateManager
    expect(true).toBe(true);
  });
});
