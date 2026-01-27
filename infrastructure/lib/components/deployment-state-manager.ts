/**
 * Deployment State Manager
 * 
 * Manages deployment state tracking in DynamoDB including:
 * - Recording deployment start and completion
 * - Updating deployment status and test results
 * - Querying deployment history
 * - Retrieving last known good deployments
 */

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Deployment status values
 */
export type DeploymentStatus = 'in_progress' | 'succeeded' | 'failed' | 'rolled_back';

/**
 * Environment values
 */
export type Environment = 'test' | 'staging' | 'production';

/**
 * Test results for a deployment
 */
export interface TestResults {
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  e2eTestsPassed: boolean;
  coveragePercentage: number;
}

/**
 * Information about a deployment to record
 */
export interface DeploymentInfo {
  environment: Environment;
  commitSha: string;
  commitMessage: string;
  commitAuthor: string;
  pipelineExecutionId: string;
  artifactLocation: string;
  infrastructureChanged: boolean;
}

/**
 * Complete deployment record stored in DynamoDB
 */
export interface DeploymentRecord {
  deploymentId: string;
  environment: Environment;
  version: string;
  status: DeploymentStatus;
  startTime: number;
  endTime?: number;
  infrastructureChanged: boolean;
  commitMessage: string;
  commitAuthor: string;
  pipelineExecutionId: string;
  unitTestsPassed: boolean;
  integrationTestsPassed: boolean;
  e2eTestsPassed: boolean;
  coveragePercentage: number;
  rollbackReason?: string;
  rollbackLevel?: 'stage' | 'full';
  rollbackTime?: number;
  artifactLocation: string;
  expiresAt: number;
}

/**
 * Deployment State Manager
 * 
 * Provides methods for tracking deployment state in DynamoDB:
 * - Record deployment start
 * - Update deployment status
 * - Query deployment history
 * - Get last known good deployment
 */
export class DeploymentStateManager {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  /**
   * Create a new Deployment State Manager
   * 
   * @param tableName - Name of the DynamoDB table for deployment records
   * @param region - AWS region (defaults to us-east-1)
   */
  constructor(tableName: string, region: string = 'us-east-1') {
    this.tableName = tableName;
    this.client = new DynamoDBClient({ region });
  }

  /**
   * Record the start of a new deployment
   * 
   * Creates a new deployment record in DynamoDB with status 'in_progress'
   * and calculates TTL for automatic cleanup after 90 days.
   * 
   * @param deployment - Deployment information to record
   * @returns Promise that resolves when record is created
   * @throws Error if DynamoDB operation fails
   */
  async recordDeploymentStart(deployment: DeploymentInfo): Promise<void> {
    const now = Date.now();
    const deploymentId = `${deployment.environment}#${now}`;
    
    // Calculate TTL: current time + 90 days in seconds
    const ttlSeconds = Math.floor(now / 1000) + (90 * 24 * 60 * 60);
    
    const record: DeploymentRecord = {
      deploymentId,
      environment: deployment.environment,
      version: deployment.commitSha,
      status: 'in_progress',
      startTime: now,
      infrastructureChanged: deployment.infrastructureChanged,
      commitMessage: deployment.commitMessage,
      commitAuthor: deployment.commitAuthor,
      pipelineExecutionId: deployment.pipelineExecutionId,
      artifactLocation: deployment.artifactLocation,
      expiresAt: ttlSeconds,
      unitTestsPassed: false,
      integrationTestsPassed: false,
      e2eTestsPassed: false,
      coveragePercentage: 0,
    };
    
    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(record, { removeUndefinedValues: true }),
      });
      
      await this.client.send(command);
    } catch (error) {
      throw new Error(
        `Failed to record deployment start for ${deploymentId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update the status of an existing deployment
   * 
   * Updates deployment status, end time, and optionally test results.
   * 
   * @param deploymentId - ID of the deployment to update
   * @param status - New deployment status
   * @param testResults - Optional test results to record
   * @returns Promise that resolves when update is complete
   * @throws Error if DynamoDB operation fails
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus,
    testResults?: TestResults
  ): Promise<void> {
    const now = Date.now();
    
    // Build update expression dynamically
    const updateExpressions: string[] = ['#status = :status', '#endTime = :endTime'];
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#endTime': 'endTime',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':status': { S: status },
      ':endTime': { N: String(now) },
    };
    
    // Add test results if provided
    if (testResults) {
      updateExpressions.push(
        '#unitTestsPassed = :unitTestsPassed',
        '#integrationTestsPassed = :integrationTestsPassed',
        '#e2eTestsPassed = :e2eTestsPassed',
        '#coveragePercentage = :coveragePercentage'
      );
      
      expressionAttributeNames['#unitTestsPassed'] = 'unitTestsPassed';
      expressionAttributeNames['#integrationTestsPassed'] = 'integrationTestsPassed';
      expressionAttributeNames['#e2eTestsPassed'] = 'e2eTestsPassed';
      expressionAttributeNames['#coveragePercentage'] = 'coveragePercentage';
      
      expressionAttributeValues[':unitTestsPassed'] = { BOOL: testResults.unitTestsPassed };
      expressionAttributeValues[':integrationTestsPassed'] = { BOOL: testResults.integrationTestsPassed };
      expressionAttributeValues[':e2eTestsPassed'] = { BOOL: testResults.e2eTestsPassed };
      expressionAttributeValues[':coveragePercentage'] = { N: String(testResults.coveragePercentage) };
    }
    
    try {
      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ deploymentId }),
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      });
      
      await this.client.send(command);
    } catch (error) {
      throw new Error(
        `Failed to update deployment status for ${deploymentId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the last known good deployment for an environment
   * 
   * Queries the EnvironmentStatusIndex GSI for the most recent
   * deployment with status 'succeeded' in the specified environment.
   * 
   * @param environment - Environment to query
   * @returns Promise that resolves to the last successful deployment, or null if none found
   * @throws Error if DynamoDB operation fails
   */
  async getLastKnownGoodDeployment(environment: Environment): Promise<DeploymentRecord | null> {
    try {
      const queryInput: QueryCommandInput = {
        TableName: this.tableName,
        IndexName: 'EnvironmentStatusIndex',
        KeyConditionExpression: '#environment = :environment AND #status = :status',
        ExpressionAttributeNames: {
          '#environment': 'environment',
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':environment': environment,
          ':status': 'succeeded',
        }),
        ScanIndexForward: false, // Descending order (most recent first)
        Limit: 1,
      };
      
      const command = new QueryCommand(queryInput);
      const response = await this.client.send(command);
      
      if (!response.Items || response.Items.length === 0) {
        return null;
      }
      
      return unmarshall(response.Items[0]) as DeploymentRecord;
    } catch (error) {
      throw new Error(
        `Failed to get last known good deployment for ${environment}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get deployment history for an environment
   * 
   * Queries all deployments for the specified environment with pagination support.
   * Results are returned in descending order by timestamp (most recent first).
   * 
   * @param environment - Environment to query
   * @param limit - Maximum number of records to return (default: 50)
   * @param lastEvaluatedKey - Pagination token from previous query
   * @returns Promise that resolves to deployment records and pagination token
   * @throws Error if DynamoDB operation fails
   */
  async getDeploymentHistory(
    environment: Environment,
    limit: number = 50,
    lastEvaluatedKey?: Record<string, any>
  ): Promise<{
    deployments: DeploymentRecord[];
    lastEvaluatedKey?: Record<string, any>;
  }> {
    try {
      const queryInput: QueryCommandInput = {
        TableName: this.tableName,
        IndexName: 'EnvironmentStatusIndex',
        KeyConditionExpression: '#environment = :environment',
        ExpressionAttributeNames: {
          '#environment': 'environment',
        },
        ExpressionAttributeValues: marshall({
          ':environment': environment,
        }),
        ScanIndexForward: false, // Descending order (most recent first)
        Limit: limit,
      };
      
      if (lastEvaluatedKey) {
        queryInput.ExclusiveStartKey = marshall(lastEvaluatedKey);
      }
      
      const command = new QueryCommand(queryInput);
      const response = await this.client.send(command);
      
      const deployments = (response.Items || []).map(item => 
        unmarshall(item) as DeploymentRecord
      );
      
      const nextKey = response.LastEvaluatedKey 
        ? unmarshall(response.LastEvaluatedKey)
        : undefined;
      
      return {
        deployments,
        lastEvaluatedKey: nextKey,
      };
    } catch (error) {
      throw new Error(
        `Failed to get deployment history for ${environment}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

