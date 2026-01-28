/**
 * Unit tests for Notification Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  NotificationService,
  DeploymentEvent,
  RollbackEvent,
} from '../../lib/components/notification-service';

// Mock SNS client
const snsMock = mockClient(SNSClient);

describe('NotificationService', () => {
  let service: NotificationService;
  const topicArn = 'arn:aws:sns:us-east-1:123456789012:test-topic';
  
  beforeEach(() => {
    snsMock.reset();
    service = new NotificationService({ topicArn, region: 'us-east-1' });
    
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  describe('notifyDeploymentStart', () => {
    it('should send notification with correct format', async () => {
      const event: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
      };
      
      await service.notifyDeploymentStart(event);
      
      expect(snsMock.calls()).toHaveLength(1);
      const call = snsMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TopicArn: topicArn,
        Subject: 'Deployment Started - test',
      });
      
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message).toMatchObject({
        eventType: 'deployment_start',
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
      });
      expect(message.timestamp).toBeDefined();
    });
    
    it('should include additional data in message', async () => {
      const event: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
        data: {
          infrastructureChanged: true,
          testsPassed: 150,
        },
      };
      
      await service.notifyDeploymentStart(event);
      
      const call = snsMock.call(0);
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message.infrastructureChanged).toBe(true);
      expect(message.testsPassed).toBe(150);
    });
  });
  
  describe('notifyDeploymentSuccess', () => {
    it('should send notification with correct format', async () => {
      const event: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'staging',
        version: 'v1.0.0',
        executionId: 'exec-456',
      };
      
      await service.notifyDeploymentSuccess(event);
      
      expect(snsMock.calls()).toHaveLength(1);
      const call = snsMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TopicArn: topicArn,
        Subject: 'Deployment Succeeded - staging',
      });
      
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message).toMatchObject({
        eventType: 'deployment_success',
        deploymentId: 'deploy-123',
        environment: 'staging',
        version: 'v1.0.0',
        executionId: 'exec-456',
      });
    });
  });
  
  describe('notifyDeploymentFailure', () => {
    it('should send notification with correct format', async () => {
      const event: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'production',
        version: 'v1.0.0',
        executionId: 'exec-456',
        data: {
          error: 'Test failure',
          failedTests: 5,
        },
      };
      
      await service.notifyDeploymentFailure(event);
      
      expect(snsMock.calls()).toHaveLength(1);
      const call = snsMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TopicArn: topicArn,
        Subject: 'Deployment Failed - production',
      });
      
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message).toMatchObject({
        eventType: 'deployment_failure',
        deploymentId: 'deploy-123',
        environment: 'production',
        version: 'v1.0.0',
        executionId: 'exec-456',
        error: 'Test failure',
        failedTests: 5,
      });
    });
  });
  
  describe('notifyRollbackInitiated', () => {
    it('should send notification with correct format', async () => {
      const event: RollbackEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        currentVersion: 'v1.0.0',
        targetVersion: 'v0.9.0',
        reason: 'Test failure',
      };
      
      await service.notifyRollbackInitiated(event);
      
      expect(snsMock.calls()).toHaveLength(1);
      const call = snsMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TopicArn: topicArn,
        Subject: 'Rollback Initiated - test',
      });
      
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message).toMatchObject({
        eventType: 'rollback_initiated',
        deploymentId: 'deploy-123',
        environment: 'test',
        currentVersion: 'v1.0.0',
        targetVersion: 'v0.9.0',
        reason: 'Test failure',
      });
    });
    
    it('should handle missing optional fields', async () => {
      const event: RollbackEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        currentVersion: 'v1.0.0',
      };
      
      await service.notifyRollbackInitiated(event);
      
      const call = snsMock.call(0);
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message.targetVersion).toBe('unknown');
      expect(message.reason).toBe('unknown');
    });
  });
  
  describe('notifyRollbackSuccess', () => {
    it('should send notification with correct format', async () => {
      const event: RollbackEvent = {
        deploymentId: 'deploy-123',
        environment: 'staging',
        currentVersion: 'v1.0.0',
        targetVersion: 'v0.9.0',
        level: 'stage',
      };
      
      await service.notifyRollbackSuccess(event);
      
      expect(snsMock.calls()).toHaveLength(1);
      const call = snsMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TopicArn: topicArn,
        Subject: 'Rollback Succeeded - staging',
      });
      
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message).toMatchObject({
        eventType: 'rollback_success',
        deploymentId: 'deploy-123',
        environment: 'staging',
        currentVersion: 'v1.0.0',
        targetVersion: 'v0.9.0',
        level: 'stage',
      });
    });
  });
  
  describe('notifyRollbackFailure', () => {
    it('should send notification with correct format', async () => {
      const event: RollbackEvent = {
        deploymentId: 'deploy-123',
        environment: 'production',
        currentVersion: 'v1.0.0',
        reason: 'Artifacts not found',
      };
      
      await service.notifyRollbackFailure(event);
      
      expect(snsMock.calls()).toHaveLength(1);
      const call = snsMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TopicArn: topicArn,
        Subject: 'Rollback Failed - production',
      });
      
      const message = JSON.parse(call.args[0].input.Message as string);
      expect(message).toMatchObject({
        eventType: 'rollback_failure',
        deploymentId: 'deploy-123',
        environment: 'production',
        currentVersion: 'v1.0.0',
        reason: 'Artifacts not found',
      });
    });
  });
  
  describe('error handling', () => {
    it('should handle SNS publish errors gracefully', async () => {
      snsMock.on(PublishCommand).rejects(new Error('SNS error'));
      
      const event: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
      };
      
      // Should not throw
      await expect(service.notifyDeploymentStart(event)).resolves.not.toThrow();
      
      // Should log error
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send notification')
      );
    });
    
    it('should continue execution after notification failure', async () => {
      snsMock.on(PublishCommand).rejects(new Error('SNS error'));
      
      const event: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
      };
      
      await service.notifyDeploymentStart(event);
      await service.notifyDeploymentSuccess(event);
      
      // Both should be attempted despite failures
      expect(snsMock.calls()).toHaveLength(2);
    });
  });
  
  describe('message format validation', () => {
    it('should produce valid JSON for all notification types', async () => {
      const deploymentEvent: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
      };
      
      const rollbackEvent: RollbackEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        currentVersion: 'v1.0.0',
        targetVersion: 'v0.9.0',
      };
      
      await service.notifyDeploymentStart(deploymentEvent);
      await service.notifyDeploymentSuccess(deploymentEvent);
      await service.notifyDeploymentFailure(deploymentEvent);
      await service.notifyRollbackInitiated(rollbackEvent);
      await service.notifyRollbackSuccess(rollbackEvent);
      await service.notifyRollbackFailure(rollbackEvent);
      
      // All messages should be valid JSON
      expect(snsMock.calls()).toHaveLength(6);
      snsMock.calls().forEach(call => {
        const message = call.args[0].input.Message as string;
        expect(() => JSON.parse(message)).not.toThrow();
      });
    });
    
    it('should include required fields in all messages', async () => {
      const deploymentEvent: DeploymentEvent = {
        deploymentId: 'deploy-123',
        environment: 'test',
        version: 'v1.0.0',
        executionId: 'exec-456',
      };
      
      await service.notifyDeploymentStart(deploymentEvent);
      
      const call = snsMock.call(0);
      const message = JSON.parse(call.args[0].input.Message as string);
      
      // Required fields
      expect(message.eventType).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.deploymentId).toBeDefined();
      expect(message.environment).toBeDefined();
      expect(message.version).toBeDefined();
      expect(message.executionId).toBeDefined();
    });
  });
});
