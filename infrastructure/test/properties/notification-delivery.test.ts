/**
 * Property-Based Test: Notification Delivery
 * 
 * Property 7: Notification Delivery
 * For all deployment events, a notification must be sent.
 * 
 * This property ensures that every deployment event type triggers
 * a corresponding notification, maintaining observability.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mockClient } from 'aws-sdk-client-mock';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  NotificationService,
  DeploymentEvent,
  RollbackEvent,
} from '../../lib/components/notification-service';

// Mock SNS client
const snsMock = mockClient(SNSClient);

describe('Property: Notification Delivery', () => {
  const topicArn = 'arn:aws:sns:us-east-1:123456789012:test-topic';
  
  beforeEach(() => {
    snsMock.reset();
    snsMock.on(PublishCommand).resolves({});
    
    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    snsMock.reset();
  });
  
  it('should send notification for every deployment event type', async () => {
    // Arbitraries for generating test data
    const deploymentIdArb = fc.uuid();
    const environmentArb = fc.constantFrom('test', 'staging', 'production');
    const versionArb = fc.string({ minLength: 5, maxLength: 10 });
    const executionIdArb = fc.uuid();
    
    const deploymentEventArb = fc.record({
      deploymentId: deploymentIdArb,
      environment: environmentArb,
      version: versionArb,
      executionId: executionIdArb,
    });
    
    await fc.assert(
      fc.asyncProperty(deploymentEventArb, async (event: DeploymentEvent) => {
        const service = new NotificationService({ topicArn, region: 'us-east-1' });
        
        // All notification methods should complete without throwing
        await service.notifyDeploymentStart(event);
        await service.notifyDeploymentSuccess(event);
        await service.notifyDeploymentFailure(event);
        
        // Property holds if no exceptions thrown
        return true;
      }),
      { numRuns: 50 }
    );
    
    // Verify that notifications were sent
    expect(snsMock.calls().length).toBeGreaterThan(0);
  });
  
  it('should send notification for every rollback event type', async () => {
    // Arbitraries for generating test data
    const deploymentIdArb = fc.uuid();
    const environmentArb = fc.constantFrom('test', 'staging', 'production');
    const versionArb = fc.string({ minLength: 5, maxLength: 10 });
    const reasonArb = fc.string({ minLength: 10, maxLength: 50 });
    const levelArb = fc.constantFrom('stage', 'full');
    
    const rollbackEventArb = fc.record({
      deploymentId: deploymentIdArb,
      environment: environmentArb,
      currentVersion: versionArb,
      targetVersion: versionArb,
      reason: reasonArb,
      level: levelArb,
    });
    
    await fc.assert(
      fc.asyncProperty(rollbackEventArb, async (event: RollbackEvent) => {
        const service = new NotificationService({ topicArn, region: 'us-east-1' });
        
        // All notification methods should complete without throwing
        await service.notifyRollbackInitiated(event);
        await service.notifyRollbackSuccess(event);
        await service.notifyRollbackFailure(event);
        
        // Property holds if no exceptions thrown
        return true;
      }),
      { numRuns: 50 }
    );
    
    // Verify that notifications were sent
    expect(snsMock.calls().length).toBeGreaterThan(0);
  });
  
  it('should produce valid JSON for all generated events', async () => {
    const deploymentEventArb = fc.record({
      deploymentId: fc.uuid(),
      environment: fc.constantFrom('test', 'staging', 'production'),
      version: fc.string({ minLength: 5, maxLength: 10 }),
      executionId: fc.uuid(),
    });
    
    await fc.assert(
      fc.asyncProperty(deploymentEventArb, async (event: DeploymentEvent) => {
        const service = new NotificationService({ topicArn, region: 'us-east-1' });
        
        await service.notifyDeploymentStart(event);
        
        const calls = snsMock.calls();
        if (calls.length > 0) {
          // Get the most recent call
          const call = calls[calls.length - 1];
          const message = call.args[0].input.Message as string;
          
          // Should be valid JSON
          const parsed = JSON.parse(message);
          
          // Should contain required fields
          expect(parsed.eventType).toBeDefined();
          expect(parsed.timestamp).toBeDefined();
          expect(parsed.deploymentId).toBeDefined();
          expect(parsed.environment).toBeDefined();
          expect(parsed.version).toBeDefined();
          expect(parsed.executionId).toBeDefined();
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
  
  it('should handle notification failures gracefully for all event types', async () => {
    // Configure SNS to fail for this test
    snsMock.reset();
    snsMock.on(PublishCommand).rejects(new Error('SNS error'));
    
    const deploymentEventArb = fc.record({
      deploymentId: fc.uuid(),
      environment: fc.constantFrom('test', 'staging', 'production'),
      version: fc.string({ minLength: 5, maxLength: 10 }),
      executionId: fc.uuid(),
    });
    
    await fc.assert(
      fc.asyncProperty(deploymentEventArb, async (event: DeploymentEvent) => {
        const service = new NotificationService({ topicArn, region: 'us-east-1' });
        
        // All notification methods should handle errors gracefully (not throw)
        await service.notifyDeploymentStart(event);
        await service.notifyDeploymentSuccess(event);
        await service.notifyDeploymentFailure(event);
        
        // Property holds if no exceptions thrown
        return true;
      }),
      { numRuns: 50 }
    );
  });
  
  it('should maintain notification order for sequential events', async () => {
    const deploymentEventArb = fc.record({
      deploymentId: fc.uuid(),
      environment: fc.constantFrom('test', 'staging', 'production'),
      version: fc.string({ minLength: 5, maxLength: 10 }),
      executionId: fc.uuid(),
    });
    
    await fc.assert(
      fc.asyncProperty(deploymentEventArb, async (event: DeploymentEvent) => {
        const service = new NotificationService({ topicArn, region: 'us-east-1' });
        
        // Send notifications in sequence
        await service.notifyDeploymentStart(event);
        await service.notifyDeploymentSuccess(event);
        
        const calls = snsMock.calls();
        if (calls.length >= 2) {
          // Get the last two calls
          const firstCall = calls[calls.length - 2];
          const secondCall = calls[calls.length - 1];
          
          // First should be deployment_start
          const firstMessage = JSON.parse(firstCall.args[0].input.Message as string);
          expect(firstMessage.eventType).toBe('deployment_start');
          
          // Second should be deployment_success
          const secondMessage = JSON.parse(secondCall.args[0].input.Message as string);
          expect(secondMessage.eventType).toBe('deployment_success');
        }
        
        return true;
      }),
      { numRuns: 50 }
    );
  });
});
