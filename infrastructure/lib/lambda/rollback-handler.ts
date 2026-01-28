/**
 * Rollback Lambda Handler
 * 
 * Processes CloudWatch alarm events from EventBridge and triggers
 * automated rollback procedures for failed deployments.
 * 
 * Event Flow:
 * 1. CloudWatch alarm enters ALARM state
 * 2. EventBridge rule triggers this Lambda
 * 3. Lambda checks if alarm is deployment-related
 * 4. Lambda queries DynamoDB for active deployment
 * 5. Lambda triggers rollback via RollbackOrchestrator
 */

import {
  RollbackOrchestrator,
  RollbackOrchestratorConfig,
  Deployment,
} from '../components/rollback-orchestrator';
import {
  DeploymentStateManager,
  Environment,
} from '../components/deployment-state-manager';

/**
 * CloudWatch Alarm Event from EventBridge
 */
export interface AlarmEvent {
  version: string;
  id: string;
  'detail-type': 'CloudWatch Alarm State Change';
  source: 'aws.cloudwatch';
  account: string;
  time: string;
  region: string;
  detail: {
    alarmName: string;
    state: {
      value: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
      reason: string;
      timestamp: string;
    };
    previousState: {
      value: string;
      timestamp: string;
    };
  };
}

/**
 * Lambda handler response
 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * Alarm Event Processor
 * 
 * Processes CloudWatch alarm events and triggers rollback when appropriate.
 */
export class AlarmEventProcessor {
  private readonly orchestrator: RollbackOrchestrator;
  private readonly deploymentStateManager: DeploymentStateManager;
  private readonly environmentPrefixes: string[];
  
  /**
   * Create a new Alarm Event Processor
   * 
   * @param orchestrator - Rollback orchestrator instance
   * @param deploymentStateManager - Deployment state manager instance
   * @param environmentPrefixes - Array of environment prefixes to monitor (e.g., ['kiro-worker-test', 'kiro-worker-staging'])
   */
  constructor(
    orchestrator: RollbackOrchestrator,
    deploymentStateManager: DeploymentStateManager,
    environmentPrefixes: string[]
  ) {
    this.orchestrator = orchestrator;
    this.deploymentStateManager = deploymentStateManager;
    this.environmentPrefixes = environmentPrefixes;
  }
  
  /**
   * Process CloudWatch alarm event
   * 
   * Checks if alarm is deployment-related and triggers rollback if needed.
   * 
   * @param event - CloudWatch alarm event from EventBridge
   * @returns Promise that resolves when processing is complete
   * @throws Error if processing fails
   */
  async processAlarmEvent(event: AlarmEvent): Promise<void> {
    const { alarmName, state } = event.detail;
    
    this.log('info', 'Processing alarm event', {
      alarmName,
      state: state.value,
      reason: state.reason,
    });
    
    // Only process ALARM state changes
    if (state.value !== 'ALARM') {
      this.log('info', 'Ignoring non-ALARM state', {
        alarmName,
        state: state.value,
      });
      return;
    }
    
    // Check if alarm is deployment-related
    if (!this.isDeploymentAlarm(alarmName)) {
      this.log('info', 'Ignoring non-deployment alarm', { alarmName });
      return;
    }
    
    // Extract environment from alarm name
    const environment = this.extractEnvironment(alarmName);
    
    if (!environment) {
      this.log('warn', 'Could not extract environment from alarm name', {
        alarmName,
      });
      return;
    }
    
    // Get current active deployment
    this.log('info', 'Querying for active deployment', { environment });
    
    const deployment = await this.getCurrentDeployment(environment);
    
    if (!deployment) {
      this.log('warn', 'No active deployment found for alarm', {
        alarmName,
        environment,
      });
      return;
    }
    
    // Trigger rollback
    this.log('info', 'Triggering rollback', {
      deploymentId: deployment.deploymentId,
      environment: deployment.environment,
      version: deployment.version,
      alarmName,
    });
    
    try {
      const result = await this.orchestrator.executeRollback(
        deployment,
        `CloudWatch alarm: ${alarmName} in ALARM state - ${state.reason}`
      );
      
      if (result.success) {
        this.log('info', 'Rollback completed successfully', {
          deploymentId: deployment.deploymentId,
          level: result.level,
          duration: result.duration,
        });
      } else {
        this.log('error', 'Rollback failed', {
          deploymentId: deployment.deploymentId,
          reason: result.reason,
        });
        
        throw new Error(`Rollback failed: ${result.reason}`);
      }
    } catch (error) {
      this.log('error', 'Rollback execution failed', {
        deploymentId: deployment.deploymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * Check if alarm is deployment-related
   * 
   * Deployment-related alarms match one of the configured environment prefixes.
   * 
   * @param alarmName - CloudWatch alarm name
   * @returns True if alarm is deployment-related
   */
  private isDeploymentAlarm(alarmName: string): boolean {
    return this.environmentPrefixes.some(prefix => 
      alarmName.startsWith(prefix)
    );
  }
  
  /**
   * Extract environment from alarm name
   * 
   * Alarm names follow pattern: {prefix}-{environment}-{metric}
   * Example: kiro-worker-production-build-failures
   * 
   * @param alarmName - CloudWatch alarm name
   * @returns Environment name or null if not found
   */
  private extractEnvironment(alarmName: string): Environment | null {
    // Try to match each environment prefix
    for (const prefix of this.environmentPrefixes) {
      if (alarmName.startsWith(prefix)) {
        // Extract environment from prefix
        // Prefix format: kiro-worker-{environment}
        const parts = prefix.split('-');
        const env = parts[parts.length - 1];
        
        if (env === 'test' || env === 'staging' || env === 'production') {
          return env as Environment;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Get current active deployment for environment
   * 
   * Queries DynamoDB for the most recent deployment with status 'in_progress'.
   * 
   * @param environment - Environment to query
   * @returns Active deployment or null if none found
   */
  private async getCurrentDeployment(environment: Environment): Promise<Deployment | null> {
    try {
      // Get deployment history (most recent first)
      const { deployments } = await this.deploymentStateManager.getDeploymentHistory(
        environment,
        10 // Get last 10 deployments
      );
      
      // Find first in_progress deployment
      const activeDeployment = deployments.find(d => d.status === 'in_progress');
      
      if (!activeDeployment) {
        return null;
      }
      
      // Convert DeploymentRecord to Deployment
      return {
        deploymentId: activeDeployment.deploymentId,
        environment: activeDeployment.environment,
        version: activeDeployment.version,
        infrastructureChanged: activeDeployment.infrastructureChanged,
        pipelineExecutionId: activeDeployment.pipelineExecutionId,
      };
    } catch (error) {
      this.log('error', 'Failed to get current deployment', {
        environment,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
  
  /**
   * Structured logging
   * 
   * Outputs JSON-formatted log messages with timestamp, level, and context.
   * 
   * @param level - Log level (info, warn, error)
   * @param message - Log message
   * @param context - Additional context data
   */
  private log(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: 'AlarmEventProcessor',
      ...context,
    };
    
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Lambda handler function
 * 
 * Processes CloudWatch alarm events from EventBridge.
 * 
 * Environment Variables:
 * - TABLE_NAME: DynamoDB table name for deployment records
 * - TOPIC_ARN: SNS topic ARN for rollback notifications
 * - ARTIFACTS_BUCKET: S3 bucket name for deployment artifacts
 * - AWS_REGION: AWS region (automatically set by Lambda)
 * - ENVIRONMENT_PREFIXES: Comma-separated list of environment prefixes to monitor
 * 
 * @param event - CloudWatch alarm event from EventBridge
 * @returns Promise that resolves to handler response
 */
export async function handler(event: AlarmEvent): Promise<HandlerResponse> {
  const startTime = Date.now();
  
  // Get configuration from environment variables
  const tableName = process.env.TABLE_NAME;
  const topicArn = process.env.TOPIC_ARN;
  const artifactsBucket = process.env.ARTIFACTS_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  const environmentPrefixes = (process.env.ENVIRONMENT_PREFIXES || '').split(',');
  
  // Validate configuration
  if (!tableName || !topicArn || !artifactsBucket) {
    const error = 'Missing required environment variables: TABLE_NAME, TOPIC_ARN, ARTIFACTS_BUCKET';
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: error,
      component: 'RollbackHandler',
    }));
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error }),
    };
  }
  
  if (environmentPrefixes.length === 0 || environmentPrefixes[0] === '') {
    const error = 'Missing required environment variable: ENVIRONMENT_PREFIXES';
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: error,
      component: 'RollbackHandler',
    }));
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error }),
    };
  }
  
  try {
    // Create orchestrator configuration
    const orchestratorConfig: RollbackOrchestratorConfig = {
      tableName,
      topicArn,
      artifactsBucket,
      region,
    };
    
    // Create instances
    const orchestrator = new RollbackOrchestrator(orchestratorConfig);
    const deploymentStateManager = new DeploymentStateManager(tableName, region);
    const processor = new AlarmEventProcessor(
      orchestrator,
      deploymentStateManager,
      environmentPrefixes
    );
    
    // Process alarm event
    await processor.processAlarmEvent(event);
    
    const duration = Date.now() - startTime;
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Alarm event processed successfully',
      component: 'RollbackHandler',
      duration: `${duration}ms`,
      alarmName: event.detail.alarmName,
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Alarm event processed successfully',
        alarmName: event.detail.alarmName,
        duration: `${duration}ms`,
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Failed to process alarm event',
      component: 'RollbackHandler',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
      alarmName: event.detail.alarmName,
    }));
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process alarm event',
        message: error instanceof Error ? error.message : String(error),
        alarmName: event.detail.alarmName,
      }),
    };
  }
}
