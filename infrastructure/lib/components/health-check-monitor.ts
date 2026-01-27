/**
 * Health Check Monitor
 * 
 * Monitors application health during and after deployment by:
 * - Checking CloudWatch alarm states
 * - Running custom health check logic
 * - Stopping immediately if any alarm enters ALARM state
 * 
 * Used to validate deployment success and trigger rollback if needed.
 */

import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  DescribeAlarmsCommandInput,
  MetricAlarm,
} from '@aws-sdk/client-cloudwatch';

/**
 * Alarm state information
 */
export interface AlarmInfo {
  /** Alarm name */
  name: string;
  
  /** Current alarm state */
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  
  /** Reason for current state */
  reason?: string;
}

/**
 * Result of health check monitoring
 */
export interface HealthCheckResult {
  /** Whether health checks passed */
  success: boolean;
  
  /** List of failed alarms (if any) */
  failedAlarms: AlarmInfo[];
  
  /** Duration of monitoring in milliseconds */
  duration: number;
  
  /** Reason for failure (if applicable) */
  reason?: string;
}

/**
 * Health Check Monitor
 * 
 * Monitors CloudWatch alarms and runs health checks for a specified duration.
 * Stops immediately if any alarm enters ALARM state.
 */
export class HealthCheckMonitor {
  private readonly client: CloudWatchClient;
  private readonly alarmNames: string[];
  private readonly checkInterval: number = 30000; // 30 seconds
  
  /**
   * Create a new Health Check Monitor
   * 
   * @param alarmNames - List of CloudWatch alarm names to monitor
   * @param region - AWS region (defaults to us-east-1)
   */
  constructor(alarmNames: string[], region: string = 'us-east-1') {
    this.alarmNames = alarmNames;
    this.client = new CloudWatchClient({ region });
  }
  
  /**
   * Monitor health checks for specified duration
   * 
   * Checks alarm states every 30 seconds for the specified duration.
   * Stops immediately if any alarm enters ALARM state.
   * 
   * @param durationMs - Duration to monitor in milliseconds (default: 5 minutes)
   * @returns Promise that resolves to health check result
   * @throws Error if CloudWatch operations fail
   */
  async monitorHealthChecks(durationMs: number = 5 * 60 * 1000): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    
    this.log('info', 'Starting health check monitoring', {
      duration: `${durationMs / 1000}s`,
      alarmCount: this.alarmNames.length,
      checkInterval: `${this.checkInterval / 1000}s`,
    });
    
    try {
      while (Date.now() < endTime) {
        // Check alarms
        const alarmStates = await this.checkAlarms();
        
        // Check if any alarm is in ALARM state
        const failedAlarms = alarmStates.filter(alarm => alarm.state === 'ALARM');
        
        if (failedAlarms.length > 0) {
          const duration = Date.now() - startTime;
          this.log('error', 'Health check failed - alarms in ALARM state', {
            failedAlarms: failedAlarms.map(a => a.name),
            duration: `${duration / 1000}s`,
          });
          
          return {
            success: false,
            failedAlarms,
            duration,
            reason: `${failedAlarms.length} alarm(s) in ALARM state`,
          };
        }
        
        // Run custom health checks
        const healthCheckResult = await this.runHealthChecks();
        
        if (!healthCheckResult.success) {
          const duration = Date.now() - startTime;
          this.log('error', 'Health check failed - custom checks failed', {
            reason: healthCheckResult.reason,
            duration: `${duration / 1000}s`,
          });
          
          return {
            success: false,
            failedAlarms: [],
            duration,
            reason: healthCheckResult.reason,
          };
        }
        
        // Log progress
        const elapsed = Date.now() - startTime;
        const remaining = endTime - Date.now();
        this.log('info', 'Health check passed', {
          elapsed: `${elapsed / 1000}s`,
          remaining: `${remaining / 1000}s`,
          alarmsChecked: alarmStates.length,
        });
        
        // Wait for next check interval (if not at end)
        if (Date.now() + this.checkInterval < endTime) {
          await this.sleep(this.checkInterval);
        } else {
          // Less than check interval remaining, wait until end
          const remainingTime = endTime - Date.now();
          if (remainingTime > 0) {
            await this.sleep(remainingTime);
          }
          break;
        }
      }
      
      // All checks passed for full duration
      const duration = Date.now() - startTime;
      this.log('info', 'Health check monitoring completed successfully', {
        duration: `${duration / 1000}s`,
      });
      
      return {
        success: true,
        failedAlarms: [],
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Health check monitoring failed with error', {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration / 1000}s`,
      });
      
      throw new Error(
        `Health check monitoring failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Check CloudWatch alarm states
   * 
   * Queries CloudWatch for current state of all monitored alarms.
   * 
   * @returns Promise that resolves to array of alarm states
   * @throws Error if CloudWatch operation fails
   */
  async checkAlarms(): Promise<AlarmInfo[]> {
    // Handle empty alarm list
    if (this.alarmNames.length === 0) {
      return [];
    }
    
    try {
      const input: DescribeAlarmsCommandInput = {
        AlarmNames: this.alarmNames,
        MaxRecords: 100,
      };
      
      const command = new DescribeAlarmsCommand(input);
      const response = await this.client.send(command);
      
      const alarms: AlarmInfo[] = (response.MetricAlarms || []).map((alarm: MetricAlarm) => ({
        name: alarm.AlarmName!,
        state: alarm.StateValue as 'OK' | 'ALARM' | 'INSUFFICIENT_DATA',
        reason: alarm.StateReason,
      }));
      
      return alarms;
    } catch (error) {
      throw new Error(
        `Failed to check alarms: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Run custom health checks
   * 
   * Executes custom health check logic. Currently a placeholder that always passes.
   * Can be extended to check application-specific health endpoints.
   * 
   * @returns Promise that resolves to health check result
   */
  async runHealthChecks(): Promise<{ success: boolean; reason?: string }> {
    // Placeholder for custom health check logic
    // In a real implementation, this would check application health endpoints,
    // database connectivity, etc.
    
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
      component: 'HealthCheckMonitor',
      ...context,
    };
    
    console.log(JSON.stringify(logEntry));
  }
}
