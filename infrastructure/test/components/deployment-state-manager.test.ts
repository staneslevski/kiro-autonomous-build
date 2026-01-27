/**
 * Unit tests for Deployment State Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  DeploymentStateManager,
  DeploymentInfo,
  DeploymentStatus,
  TestResults,
  DeploymentRecord,
} from '../../lib/components/deployment-state-manager';

// Create mock DynamoDB client
const dynamoDBMock = mockClient(DynamoDBClient);

describe('DeploymentStateManager', () => {
  let manager: DeploymentStateManager;
  const tableName = 'test-deployments-table';
  
  beforeEach(() => {
    // Reset mock before each test
    dynamoDBMock.reset();
    
    // Create new manager instance
    manager = new DeploymentStateManager(tableName, 'us-east-1');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('recordDeploymentStart', () => {
    it('should create deployment record with correct structure and TTL', async () => {
      // Arrange
      const deployment: DeploymentInfo = {
        environment: 'test',
        commitSha: 'abc123def456',
        commitMessage: 'feat: add new feature',
        commitAuthor: 'developer@example.com',
        pipelineExecutionId: 'execution-123',
        artifactLocation: 's3://bucket/artifacts/abc123',
        infrastructureChanged: false,
      };
      
      dynamoDBMock.on(PutItemCommand).resolves({});
      
      // Act
      await manager.recordDeploymentStart(deployment);
      
      // Assert
      expect(dynamoDBMock.calls()).toHaveLength(1);
      const call = dynamoDBMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: tableName,
      });
      
      // Verify the item structure
      const item = call.args[0].input.Item;
      expect(item).toBeDefined();
      expect(item.deploymentId).toBeDefined();
      expect(item.environment.S).toBe('test');
      expect(item.version.S).toBe('abc123def456');
      expect(item.status.S).toBe('in_progress');
      expect(item.startTime.N).toBeDefined();
      expect(item.infrastructureChanged.BOOL).toBe(false);
      expect(item.commitMessage.S).toBe('feat: add new feature');
      expect(item.commitAuthor.S).toBe('developer@example.com');
      expect(item.pipelineExecutionId.S).toBe('execution-123');
      expect(item.artifactLocation.S).toBe('s3://bucket/artifacts/abc123');
      expect(item.expiresAt.N).toBeDefined();
      expect(item.unitTestsPassed.BOOL).toBe(false);
      expect(item.integrationTestsPassed.BOOL).toBe(false);
      expect(item.e2eTestsPassed.BOOL).toBe(false);
      expect(item.coveragePercentage.N).toBe('0');
      
      // Verify TTL is approximately 90 days from now (in seconds)
      const ttl = parseInt(item.expiresAt.N);
      const now = Math.floor(Date.now() / 1000);
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      expect(ttl).toBeGreaterThan(now + ninetyDaysInSeconds - 10); // Allow 10 second tolerance
      expect(ttl).toBeLessThan(now + ninetyDaysInSeconds + 10);
    });
    
    it('should throw error when DynamoDB operation fails', async () => {
      // Arrange
      const deployment: DeploymentInfo = {
        environment: 'test',
        commitSha: 'abc123',
        commitMessage: 'test',
        commitAuthor: 'test@example.com',
        pipelineExecutionId: 'exec-123',
        artifactLocation: 's3://bucket/test',
        infrastructureChanged: false,
      };
      
      dynamoDBMock.on(PutItemCommand).rejects(new Error('DynamoDB error'));
      
      // Act & Assert
      await expect(manager.recordDeploymentStart(deployment)).rejects.toThrow(
        /Failed to record deployment start/
      );
    });
  });
  
  describe('updateDeploymentStatus', () => {
    it('should update status and timestamps correctly', async () => {
      // Arrange
      const deploymentId = 'test#1234567890';
      const status: DeploymentStatus = 'succeeded';
      
      dynamoDBMock.on(UpdateItemCommand).resolves({});
      
      // Act
      await manager.updateDeploymentStatus(deploymentId, status);
      
      // Assert
      expect(dynamoDBMock.calls()).toHaveLength(1);
      const call = dynamoDBMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: tableName,
      });
      
      const input = call.args[0].input;
      expect(input.Key).toEqual(marshall({ deploymentId }));
      expect(input.UpdateExpression).toContain('#status = :status');
      expect(input.UpdateExpression).toContain('#endTime = :endTime');
      expect(input.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#endTime': 'endTime',
      });
      expect(input.ExpressionAttributeValues[':status'].S).toBe('succeeded');
      expect(input.ExpressionAttributeValues[':endTime'].N).toBeDefined();
    });
    
    it('should update test results when provided', async () => {
      // Arrange
      const deploymentId = 'test#1234567890';
      const status: DeploymentStatus = 'succeeded';
      const testResults: TestResults = {
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
      };
      
      dynamoDBMock.on(UpdateItemCommand).resolves({});
      
      // Act
      await manager.updateDeploymentStatus(deploymentId, status, testResults);
      
      // Assert
      expect(dynamoDBMock.calls()).toHaveLength(1);
      const call = dynamoDBMock.call(0);
      const input = call.args[0].input;
      
      expect(input.UpdateExpression).toContain('#unitTestsPassed = :unitTestsPassed');
      expect(input.UpdateExpression).toContain('#integrationTestsPassed = :integrationTestsPassed');
      expect(input.UpdateExpression).toContain('#e2eTestsPassed = :e2eTestsPassed');
      expect(input.UpdateExpression).toContain('#coveragePercentage = :coveragePercentage');
      
      expect(input.ExpressionAttributeNames['#unitTestsPassed']).toBe('unitTestsPassed');
      expect(input.ExpressionAttributeNames['#integrationTestsPassed']).toBe('integrationTestsPassed');
      expect(input.ExpressionAttributeNames['#e2eTestsPassed']).toBe('e2eTestsPassed');
      expect(input.ExpressionAttributeNames['#coveragePercentage']).toBe('coveragePercentage');
      
      expect(input.ExpressionAttributeValues[':unitTestsPassed'].BOOL).toBe(true);
      expect(input.ExpressionAttributeValues[':integrationTestsPassed'].BOOL).toBe(true);
      expect(input.ExpressionAttributeValues[':e2eTestsPassed'].BOOL).toBe(true);
      expect(input.ExpressionAttributeValues[':coveragePercentage'].N).toBe('85');
    });
    
    it('should throw error when DynamoDB operation fails', async () => {
      // Arrange
      const deploymentId = 'test#1234567890';
      const status: DeploymentStatus = 'failed';
      
      dynamoDBMock.on(UpdateItemCommand).rejects(new Error('DynamoDB error'));
      
      // Act & Assert
      await expect(manager.updateDeploymentStatus(deploymentId, status)).rejects.toThrow(
        /Failed to update deployment status/
      );
    });
  });
  
  describe('getLastKnownGoodDeployment', () => {
    it('should return most recent succeeded deployment', async () => {
      // Arrange
      const environment = 'production';
      const mockDeployment: DeploymentRecord = {
        deploymentId: 'production#1234567890',
        environment: 'production',
        version: 'abc123def456',
        status: 'succeeded',
        startTime: 1234567890,
        endTime: 1234567900,
        infrastructureChanged: false,
        commitMessage: 'feat: add feature',
        commitAuthor: 'dev@example.com',
        pipelineExecutionId: 'exec-123',
        unitTestsPassed: true,
        integrationTestsPassed: true,
        e2eTestsPassed: true,
        coveragePercentage: 85,
        artifactLocation: 's3://bucket/artifacts',
        expiresAt: 1234567890 + (90 * 24 * 60 * 60),
      };
      
      dynamoDBMock.on(QueryCommand).resolves({
        Items: [marshall(mockDeployment)],
      });
      
      // Act
      const result = await manager.getLastKnownGoodDeployment(environment);
      
      // Assert
      expect(result).toEqual(mockDeployment);
      expect(dynamoDBMock.calls()).toHaveLength(1);
      const call = dynamoDBMock.call(0);
      const input = call.args[0].input;
      
      expect(input.TableName).toBe(tableName);
      expect(input.IndexName).toBe('EnvironmentStatusIndex');
      expect(input.KeyConditionExpression).toBe('#environment = :environment AND #status = :status');
      expect(input.ScanIndexForward).toBe(false); // Descending order
      expect(input.Limit).toBe(1);
    });
    
    it('should return null when no succeeded deployments exist', async () => {
      // Arrange
      const environment = 'test';
      
      dynamoDBMock.on(QueryCommand).resolves({
        Items: [],
      });
      
      // Act
      const result = await manager.getLastKnownGoodDeployment(environment);
      
      // Assert
      expect(result).toBeNull();
    });
    
    it('should throw error when DynamoDB operation fails', async () => {
      // Arrange
      const environment = 'staging';
      
      dynamoDBMock.on(QueryCommand).rejects(new Error('DynamoDB error'));
      
      // Act & Assert
      await expect(manager.getLastKnownGoodDeployment(environment)).rejects.toThrow(
        /Failed to get last known good deployment/
      );
    });
  });
  
  describe('getDeploymentHistory', () => {
    it('should return deployments in descending order by timestamp', async () => {
      // Arrange
      const environment = 'test';
      const mockDeployments: DeploymentRecord[] = [
        {
          deploymentId: 'test#1234567893',
          environment: 'test',
          version: 'abc123',
          status: 'succeeded',
          startTime: 1234567893,
          endTime: 1234567900,
          infrastructureChanged: false,
          commitMessage: 'feat: latest',
          commitAuthor: 'dev@example.com',
          pipelineExecutionId: 'exec-3',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 85,
          artifactLocation: 's3://bucket/artifacts',
          expiresAt: 1234567893 + (90 * 24 * 60 * 60),
        },
        {
          deploymentId: 'test#1234567892',
          environment: 'test',
          version: 'def456',
          status: 'succeeded',
          startTime: 1234567892,
          endTime: 1234567899,
          infrastructureChanged: false,
          commitMessage: 'feat: middle',
          commitAuthor: 'dev@example.com',
          pipelineExecutionId: 'exec-2',
          unitTestsPassed: true,
          integrationTestsPassed: true,
          e2eTestsPassed: true,
          coveragePercentage: 82,
          artifactLocation: 's3://bucket/artifacts',
          expiresAt: 1234567892 + (90 * 24 * 60 * 60),
        },
      ];
      
      dynamoDBMock.on(QueryCommand).resolves({
        Items: mockDeployments.map(d => marshall(d)),
      });
      
      // Act
      const result = await manager.getDeploymentHistory(environment);
      
      // Assert
      expect(result.deployments).toHaveLength(2);
      expect(result.deployments[0].deploymentId).toBe('test#1234567893');
      expect(result.deployments[1].deploymentId).toBe('test#1234567892');
      expect(result.lastEvaluatedKey).toBeUndefined();
      
      const call = dynamoDBMock.call(0);
      const input = call.args[0].input;
      expect(input.TableName).toBe(tableName);
      expect(input.IndexName).toBe('EnvironmentStatusIndex');
      expect(input.ScanIndexForward).toBe(false); // Descending order
      expect(input.Limit).toBe(50); // Default limit
    });
    
    it('should support pagination with custom limit', async () => {
      // Arrange
      const environment = 'staging';
      const limit = 10;
      const lastEvaluatedKey = { deploymentId: 'staging#1234567890', environment: 'staging' };
      
      dynamoDBMock.on(QueryCommand).resolves({
        Items: [],
        LastEvaluatedKey: marshall({ deploymentId: 'staging#1234567880', environment: 'staging' }),
      });
      
      // Act
      const result = await manager.getDeploymentHistory(environment, limit, lastEvaluatedKey);
      
      // Assert
      const call = dynamoDBMock.call(0);
      const input = call.args[0].input;
      expect(input.Limit).toBe(10);
      expect(input.ExclusiveStartKey).toEqual(marshall(lastEvaluatedKey));
      expect(result.lastEvaluatedKey).toEqual({ deploymentId: 'staging#1234567880', environment: 'staging' });
    });
    
    it('should throw error when DynamoDB operation fails', async () => {
      // Arrange
      const environment = 'production';
      
      dynamoDBMock.on(QueryCommand).rejects(new Error('DynamoDB error'));
      
      // Act & Assert
      await expect(manager.getDeploymentHistory(environment)).rejects.toThrow(
        /Failed to get deployment history/
      );
    });
  });
});

