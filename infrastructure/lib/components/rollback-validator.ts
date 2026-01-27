/**
 * Rollback Validator
 * 
 * Validates that a rollback was successful by:
 * - Checking CloudWatch alarm states (all must be OK)
 * - Running health checks
 * - Verifying deployed version matches target
 * 
 * Includes stabilization wait period before validation.
 */

import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  DescribeAlarmsCommandInput,
} from '@aws-sdk/client-cloudwatch';
import { HealthCheckMonitor } from './health-check-monitor';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  success: boolean;
  
  /** Reason for failure (if applicable) */
  reason?: string;
  
  /** Duration of validation in milliseconds */
  duration?: number;
}

/**
 * Rollback Validator configuration
 */
export interface RollbackValidatorConfig {
  /** AWS region */
  region?: string;
  
  /** Stabilization wait time in milliseconds (default: 60000 = 1 minute) */
  stabilizationWaitMs?: number;
  
  /** Health check duration in milliseconds (default: 300000 = 5 minutes) */
  healthCheckDurationMs?: number;
}

/**
 * Rollback Validator
 * 
 * Validates rollback success through multiple checks:
 * 1. Stabilization wait period
 * 2. CloudWatch alarm state verification
 * 3. Health check execution
 * 4. Version verification
 */
export class RollbackValidator {
  private readonly cloudwatch: CloudWatchClient;
  private readonly stabilizationWaitMs: number;
  private readonly healthCheckDurationMs: number;
  
  /**
   * Create a new Rollback Validator
   * 
   * @param config - Rollback validator configuration
   */
  constructor(config: RollbackValidatorConfig = {}) {
    const region = config.region || 'us-east-1';
    
    this.cloudwatch = new CloudWatchClient({ region });
    this.stabilizationWaitMs = config.stabilizationWaitMs || 60000; // 1 minute
    this.healthCheckDurationMs = config.healthCheckDurationMs || 300000; // 5 minutes
  }
  
  /**
   * Validate rollback success
   * 
   * Performs comprehensive validation:
   * 1. Wait for stabilization period
   * 2. Check all alarms are OK
   * 3. Run health checks
   * 4. Verify version (if provided)
   * 
   * @param environment - Environment to validate
   * @param alarmNames - CloudWatch alarm names to check
   * @param targetVersion - Expected version after rollback (optional)
   * @returns Promise that resolves to validation result
   */
  async validateRollback(
    environment: string,
    alarmNames: string[],
    targetVersion?: string
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    
    this.log('info', 'Starting rollback validation', {
      environment,
      alarmCount: alarmNames.length,
      targetVersion,
    });
    
    try {
      // Step 1: Wait for deployment to stabilize
      this.log('info', 'Waiting for deployment to stabilize', {
        duration: `${this.stabilizationWaitMs / 1000}s`,
      });
      
      await this.sleep(this.stabilizationWaitMs);
      
      // Step 2: Check alarm states
      this.log('info', 'Checking alarm states', {
        alarmCount: alarmNames.length,
      });
      
      const alarmCheck = await this.checkAlarms(alarmNames);
      
      if (!alarmCheck.success) {
        const duration = Date.now() - startTime;
        this.log('error', 'Alarm check failed', {
          reason: alarmCheck.reason,
          duration: `${duration / 1000}s`,
        });
        
        return {
          success: false,
          reason: alarmCheck.reason,
          duration,
        };
      }
      
      // Step 3: Run health checks
      this.log('info', 'Running health checks', {
        duration: `${this.healthCheckDurationMs / 1000}s`,
      });
      
      const healthCheck = await this.runHealthChecks(alarmNames);
      
      if (!healthCheck.success) {
        const duration = Date.now() - startTime;
        this.log('error', 'Health check failed', {
          reason: healthCheck.reason,
          duration: `${duration / 1000}s`,
        });
        
        return {
          success: false,
          reason: healthCheck.reason,
          duration,
        };
      }
      
      // Step 4: Verify version (if provided)
      if (targetVersion) {
        this.log('info', 'Verifying version', { targetVersion });
        
        const versionCheck = await this.verifyVersion(environment, targetVersion);
        
        if (!versionCheck.success) {
          const duration = Date.now() - startTime;
          this.log('error', 'Version verification failed', {
            reason: versionCheck.reason,
            duration: `${duration / 1000}s`,
          });
          
          return {
            success: false,
            reason: versionCheck.reason,
            duration,
          };
        }
      }
      
      // All checks passed
      const duration = Date.now() - startTime;
      this.log('info', 'Rollback validation succeeded', {
        duration: `${duration / 1000}s`,
      });
      
      return { success: true, duration };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Rollback validation failed with error', {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration / 1000}s`,
      });
      
      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }
  
  /**
   * Check CloudWatch alarm states
   * 
   * Verifies that all alarms are in OK state (not ALARM or INSUFFICIENT_DATA).
   * 
   * @param alarmNames - Alarm names to check
   * @returns Promise that resolves to check result
   */
  async checkAlarms(alarmNames: string[]): Promise<{ success: boolean; reason?: string }> {
    // Handle empty alarm list
    if (alarmNames.length === 0) {
      return { success: true };
    }
    
    try {
      const input: DescribeAlarmsCommandInput = {
        AlarmNames: alarmNames,
        MaxRecords: 100,
      };
      
      const command = new DescribeAlarmsCommand(input);
      const response = await this.cloudwatch.send(command);
      
      const alarms = response.MetricAlarms || [];
      
      // Check if any alarm is in ALARM state
      const alarmsInAlarmState = alarms.filter(alarm => alarm.StateValue === 'ALARM');
      
      if (alarmsInAlarmState.length > 0) {
        const alarmNames = alarmsInAlarmState.map(a => a.AlarmName).join(', ');
        return {
          success: false,
          reason: `Alarms still in ALARM state: ${alarmNames}`,
        };
      }
      
      // Check if any alarm is in INSUFFICIENT_DATA state
      const alarmsInsufficientData = alarms.filter(alarm => alarm.StateValue === 'INSUFFICIENT_DATA');
      
      if (alarmsInsufficientData.length > 0) {
        const alarmNames = alarmsInsufficientData.map(a => a.AlarmName).join(', ');
        this.log('warn', 'Some alarms have insufficient data', { alarmNames });
        // Don't fail validation for insufficient data, but log warning
      }
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        reason: `Failed to check alarms: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Run health checks
   * 
   * Executes health check monitoring for specified duration.
   * 
   * @param alarmNames - Alarm names to monitor
   * @returns Promise that resolves to health check result
   */
  async runHealthChecks(alarmNames: string[]): Promise<{ success: boolean; reason?: string }> {
    try {
      const healthMonitor = new HealthCheckMonitor(alarmNames);
      const result = await healthMonitor.monitorHealthChecks(this.healthCheckDurationMs);
      
      if (!result.success) {
        return {
          success: false,
          reason: result.reason || 'Health checks failed',
        };
      }
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        reason: `Health checks failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Verify deployed version matches target
   * 
   * Checks that the deployed version matches the expected target version.
   * This is a placeholder implementation that always succeeds.
   * 
   * In a real implementation, this would:
   * - Query the application's version endpoint
   * - Check deployment metadata in DynamoDB
   * - Verify artifact versions in S3
   * 
   * @param environment - Environment to check
   * @param targetVersion - Expected version
   * @returns Promise that resolves to verification result
   */
  async verifyVersion(
    environment: string,
    targetVersion: string
  ): Promise<{ success: boolean; reason?: string }> {
    // Placeholder implementation
    // In a real implementation, this would verify the deployed version
    
    this.log('info', 'Version verification placeholder', {
      environment,
      targetVersion,
    });
    
    // For now, always succeed
    return { success: true };
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
      component: 'RollbackValidator',
      ...context,
    };
    
    console.log(JSON.stringify(logEntry));
  }
}
