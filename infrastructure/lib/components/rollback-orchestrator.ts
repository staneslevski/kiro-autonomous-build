/**
 * Rollback Orchestrator
 * 
 * Orchestrates automated rollback procedures for failed deployments:
 * - Stage-level rollback (revert single environment)
 * - Full rollback (revert all environments)
 * - Rollback validation
 * - State tracking and notifications
 * 
 * Implements two-level rollback strategy:
 * 1. Attempt stage-level rollback first (fastest recovery)
 * 2. Fall back to full rollback if stage rollback fails
 */

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
  DeploymentStateManager,
  DeploymentRecord,
  Environment,
} from './deployment-state-manager';
import { HealthCheckMonitor } from './health-check-monitor';

/**
 * Rollback level
 */
export type RollbackLevel = 'stage' | 'full' | 'none';

/**
 * Result of rollback operation
 */
export interface RollbackResult {
  /** Whether rollback succeeded */
  success: boolean;
  
  /** Level of rollback performed */
  level: RollbackLevel;
  
  /** Reason for failure (if applicable) */
  reason?: string;
  
  /** Duration of rollback in milliseconds */
  duration?: number;
}

/**
 * Deployment information for rollback
 */
export interface Deployment {
  deploymentId: string;
  environment: Environment;
  version: string;
  previousVersion?: string;
  infrastructureChanged: boolean;
  pipelineExecutionId: string;
}

/**
 * Rollback Orchestrator configuration
 */
export interface RollbackOrchestratorConfig {
  /** DynamoDB table name for deployment records */
  tableName: string;
  
  /** SNS topic ARN for rollback notifications */
  topicArn: string;
  
  /** S3 bucket name for deployment artifacts */
  artifactsBucket: string;
  
  /** AWS region */
  region?: string;
}

/**
 * Rollback Orchestrator
 * 
 * Orchestrates automated rollback procedures with two-level strategy:
 * 1. Stage-level rollback (single environment)
 * 2. Full rollback (all environments)
 */
export class RollbackOrchestrator {
  private readonly codepipeline: CodePipelineClient;
  private readonly sns: SNSClient;
  private readonly s3: S3Client;
  private readonly deploymentStateManager: DeploymentStateManager;
  private readonly topicArn: string;
  private readonly artifactsBucket: string;
  
  /**
   * Create a new Rollback Orchestrator
   * 
   * @param config - Rollback orchestrator configuration
   */
  constructor(config: RollbackOrchestratorConfig) {
    const region = config.region || 'us-east-1';
    
    this.codepipeline = new CodePipelineClient({ region });
    this.sns = new SNSClient({ region });
    this.s3 = new S3Client({ region });
    this.deploymentStateManager = new DeploymentStateManager(config.tableName, region);
    this.topicArn = config.topicArn;
    this.artifactsBucket = config.artifactsBucket;
  }
  
  /**
   * Execute rollback for a failed deployment
   * 
   * Implements two-level rollback strategy:
   * 1. Attempt stage-level rollback first (fastest recovery)
   * 2. Fall back to full rollback if stage rollback fails
   * 
   * @param deployment - Deployment to roll back
   * @param reason - Reason for rollback
   * @returns Promise that resolves to rollback result
   */
  async executeRollback(
    deployment: Deployment,
    reason: string
  ): Promise<RollbackResult> {
    const startTime = Date.now();
    
    this.log('info', 'Starting rollback', {
      deploymentId: deployment.deploymentId,
      environment: deployment.environment,
      version: deployment.version,
      reason,
    });
    
    try {
      // Record rollback initiation
      await this.recordRollbackStart(deployment, reason);
      
      // Send notification
      await this.notifyRollbackStart(deployment, reason);
      
      // Attempt stage-level rollback first
      this.log('info', 'Attempting stage-level rollback', {
        environment: deployment.environment,
      });
      
      const stageResult = await this.rollbackStage(deployment);
      
      if (stageResult.success) {
        const duration = Date.now() - startTime;
        await this.recordRollbackSuccess(deployment, 'stage');
        await this.notifyRollbackSuccess(deployment, 'stage');
        
        this.log('info', 'Stage-level rollback succeeded', {
          environment: deployment.environment,
          duration: `${duration / 1000}s`,
        });
        
        return { success: true, level: 'stage', duration };
      }
      
      // If stage rollback fails, attempt full rollback
      this.log('warn', 'Stage rollback failed, attempting full rollback', {
        reason: stageResult.reason,
      });
      
      const fullResult = await this.rollbackFull(deployment);
      
      if (fullResult.success) {
        const duration = Date.now() - startTime;
        await this.recordRollbackSuccess(deployment, 'full');
        await this.notifyRollbackSuccess(deployment, 'full');
        
        this.log('info', 'Full rollback succeeded', {
          duration: `${duration / 1000}s`,
        });
        
        return { success: true, level: 'full', duration };
      }
      
      // Both rollback attempts failed
      const duration = Date.now() - startTime;
      await this.recordRollbackFailure(deployment);
      await this.notifyRollbackFailure(deployment);
      
      this.log('error', 'All rollback attempts failed', {
        stageReason: stageResult.reason,
        fullReason: fullResult.reason,
        duration: `${duration / 1000}s`,
      });
      
      return {
        success: false,
        level: 'none',
        reason: `Stage rollback failed: ${stageResult.reason}; Full rollback failed: ${fullResult.reason}`,
        duration,
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Rollback orchestration failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration / 1000}s`,
      });
      
      await this.notifyRollbackFailure(deployment);
      
      throw new Error(
        `Rollback orchestration failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Rollback a single environment (stage-level rollback)
   * 
   * Reverts the specified environment to the previous version.
   * 
   * @param deployment - Deployment to roll back
   * @returns Promise that resolves to rollback result
   */
  async rollbackStage(deployment: Deployment): Promise<RollbackResult> {
    const startTime = Date.now();
    
    try {
      const { environment, previousVersion } = deployment;
      
      // Get previous deployment artifacts
      this.log('info', 'Retrieving previous deployment artifacts', {
        environment,
        previousVersion,
      });
      
      const artifacts = await this.getDeploymentArtifacts(previousVersion || '');
      
      if (!artifacts) {
        return {
          success: false,
          level: 'stage',
          reason: 'Previous deployment artifacts not found',
        };
      }
      
      // Rollback infrastructure if needed
      if (deployment.infrastructureChanged) {
        this.log('info', 'Rolling back infrastructure', { environment });
        await this.rollbackInfrastructure(environment, previousVersion || '');
      }
      
      // Rollback application
      this.log('info', 'Rolling back application', { environment });
      await this.rollbackApplication(environment, artifacts);
      
      // Validate rollback
      this.log('info', 'Validating rollback', { environment });
      const validationResult = await this.validateRollback(environment);
      
      const duration = Date.now() - startTime;
      
      if (!validationResult.success) {
        return {
          success: false,
          level: 'stage',
          reason: validationResult.reason,
          duration,
        };
      }
      
      return { success: true, level: 'stage', duration };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        level: 'stage',
        reason: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }
  
  /**
   * Rollback all environments (full rollback)
   * 
   * Reverts all environments to the last known good deployment.
   * Processes environments in reverse order: production → staging → test
   * 
   * @param deployment - Deployment to roll back
   * @returns Promise that resolves to rollback result
   */
  async rollbackFull(deployment: Deployment): Promise<RollbackResult> {
    const startTime = Date.now();
    
    try {
      // Get last known good deployment
      this.log('info', 'Retrieving last known good deployment');
      
      const lastKnownGood = await this.getLastKnownGoodDeployment();
      
      if (!lastKnownGood) {
        return {
          success: false,
          level: 'full',
          reason: 'No last known good deployment found',
        };
      }
      
      // Rollback environments in reverse order
      const environments: Environment[] = ['production', 'staging', 'test'];
      
      for (const env of environments) {
        this.log('info', 'Rolling back environment', {
          environment: env,
          targetVersion: lastKnownGood.version,
        });
        
        const result = await this.rollbackStage({
          ...deployment,
          environment: env,
          previousVersion: lastKnownGood.version,
        });
        
        if (!result.success) {
          const duration = Date.now() - startTime;
          return {
            success: false,
            level: 'full',
            reason: `Failed to rollback ${env}: ${result.reason}`,
            duration,
          };
        }
      }
      
      const duration = Date.now() - startTime;
      return { success: true, level: 'full', duration };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        level: 'full',
        reason: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }
  
  /**
   * Validate rollback success
   * 
   * Checks alarms and runs health checks to ensure rollback was successful.
   * 
   * @param environment - Environment to validate
   * @returns Promise that resolves to validation result
   */
  async validateRollback(environment: string): Promise<{ success: boolean; reason?: string }> {
    try {
      // Wait for deployment to stabilize
      this.log('info', 'Waiting for deployment to stabilize', { environment });
      await this.sleep(60000); // 1 minute
      
      // Get alarm names for environment
      const alarmNames = this.getAlarmNames(environment);
      
      // Run health checks
      const healthMonitor = new HealthCheckMonitor(alarmNames);
      const healthResult = await healthMonitor.monitorHealthChecks(5 * 60 * 1000); // 5 minutes
      
      if (!healthResult.success) {
        return {
          success: false,
          reason: healthResult.reason || 'Health checks failed',
        };
      }
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Record rollback start in DynamoDB
   * 
   * @param deployment - Deployment being rolled back
   * @param reason - Reason for rollback
   */
  async recordRollbackStart(deployment: Deployment, reason: string): Promise<void> {
    // Implementation would update deployment record with rollback information
    // For now, this is a placeholder
    this.log('info', 'Recording rollback start', {
      deploymentId: deployment.deploymentId,
      reason,
    });
  }
  
  /**
   * Record rollback success in DynamoDB
   * 
   * @param deployment - Deployment that was rolled back
   * @param level - Level of rollback performed
   */
  async recordRollbackSuccess(deployment: Deployment, level: RollbackLevel): Promise<void> {
    // Implementation would update deployment record with rollback success
    // For now, this is a placeholder
    this.log('info', 'Recording rollback success', {
      deploymentId: deployment.deploymentId,
      rollbackLevel: level,
    });
  }
  
  /**
   * Record rollback failure in DynamoDB
   * 
   * @param deployment - Deployment that failed to roll back
   */
  async recordRollbackFailure(deployment: Deployment): Promise<void> {
    // Implementation would update deployment record with rollback failure
    // For now, this is a placeholder
    this.log('error', 'Recording rollback failure', {
      deploymentId: deployment.deploymentId,
    });
  }
  
  /**
   * Send notification for rollback start
   * 
   * @param deployment - Deployment being rolled back
   * @param reason - Reason for rollback
   */
  private async notifyRollbackStart(deployment: Deployment, reason: string): Promise<void> {
    const message = {
      event: 'rollback_initiated',
      environment: deployment.environment,
      currentVersion: deployment.version,
      targetVersion: deployment.previousVersion || 'unknown',
      reason,
      timestamp: new Date().toISOString(),
    };
    
    try {
      const command = new PublishCommand({
        TopicArn: this.topicArn,
        Subject: `Rollback Initiated - ${deployment.environment}`,
        Message: JSON.stringify(message, null, 2),
      });
      
      await this.sns.send(command);
    } catch (error) {
      this.log('error', 'Failed to send rollback start notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Send notification for rollback success
   * 
   * @param deployment - Deployment that was rolled back
   * @param level - Level of rollback performed
   */
  private async notifyRollbackSuccess(deployment: Deployment, level: RollbackLevel): Promise<void> {
    const message = {
      event: 'rollback_succeeded',
      environment: deployment.environment,
      level,
      version: deployment.previousVersion || 'unknown',
      timestamp: new Date().toISOString(),
    };
    
    try {
      const command = new PublishCommand({
        TopicArn: this.topicArn,
        Subject: `Rollback Succeeded - ${deployment.environment}`,
        Message: JSON.stringify(message, null, 2),
      });
      
      await this.sns.send(command);
    } catch (error) {
      this.log('error', 'Failed to send rollback success notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Send notification for rollback failure
   * 
   * @param deployment - Deployment that failed to roll back
   */
  private async notifyRollbackFailure(deployment: Deployment): Promise<void> {
    const message = {
      event: 'rollback_failed',
      environment: deployment.environment,
      version: deployment.version,
      timestamp: new Date().toISOString(),
    };
    
    try {
      const command = new PublishCommand({
        TopicArn: this.topicArn,
        Subject: `Rollback Failed - ${deployment.environment}`,
        Message: JSON.stringify(message, null, 2),
      });
      
      await this.sns.send(command);
    } catch (error) {
      this.log('error', 'Failed to send rollback failure notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Get deployment artifacts from S3
   * 
   * @param version - Version to retrieve artifacts for
   * @returns Promise that resolves to artifacts or null if not found
   */
  private async getDeploymentArtifacts(version: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.artifactsBucket,
        Key: `artifacts/${version}/artifact.zip`,
      });
      
      await this.s3.send(command);
      return `s3://${this.artifactsBucket}/artifacts/${version}/artifact.zip`;
    } catch (error) {
      this.log('warn', 'Failed to retrieve deployment artifacts', {
        version,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
  
  /**
   * Rollback infrastructure to previous version
   * 
   * @param environment - Environment to roll back
   * @param version - Version to roll back to
   */
  private async rollbackInfrastructure(environment: string, version: string): Promise<void> {
    // Placeholder for infrastructure rollback logic
    // In a real implementation, this would trigger CDK deployment with previous version
    this.log('info', 'Infrastructure rollback placeholder', { environment, version });
  }
  
  /**
   * Rollback application to previous version
   * 
   * @param environment - Environment to roll back
   * @param artifacts - Artifacts location
   */
  private async rollbackApplication(environment: string, artifacts: string): Promise<void> {
    // Placeholder for application rollback logic
    // In a real implementation, this would deploy previous application version
    this.log('info', 'Application rollback placeholder', { environment, artifacts });
  }
  
  /**
   * Get last known good deployment
   * 
   * @returns Promise that resolves to last known good deployment or null
   */
  private async getLastKnownGoodDeployment(): Promise<DeploymentRecord | null> {
    // Try to get last known good from production first
    let lastKnownGood = await this.deploymentStateManager.getLastKnownGoodDeployment('production');
    
    if (!lastKnownGood) {
      // Fall back to staging
      lastKnownGood = await this.deploymentStateManager.getLastKnownGoodDeployment('staging');
    }
    
    if (!lastKnownGood) {
      // Fall back to test
      lastKnownGood = await this.deploymentStateManager.getLastKnownGoodDeployment('test');
    }
    
    return lastKnownGood;
  }
  
  /**
   * Get alarm names for environment
   * 
   * @param environment - Environment to get alarms for
   * @returns Array of alarm names
   */
  private getAlarmNames(environment: string): string[] {
    // Return environment-specific alarm names
    return [
      `kiro-worker-${environment}-build-failures`,
      `kiro-worker-${environment}-test-failures`,
      `kiro-worker-${environment}-high-error-rate`,
    ];
  }
  
  /**
   * Sleep for specified duration
   * 
   * @param ms - Duration to sleep in milliseconds
   * @returns Promise that resolves after duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      component: 'RollbackOrchestrator',
      ...context,
    };
    
    console.log(JSON.stringify(logEntry));
  }
}
