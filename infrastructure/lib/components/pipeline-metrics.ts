/**
 * Pipeline Metrics Publisher
 * 
 * Publishes custom CloudWatch metrics for CD pipeline monitoring:
 * - Deployment duration by environment
 * - Rollback count by environment and level
 * - Test success rate
 * 
 * All metrics are published to the 'KiroPipeline' namespace.
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
  PutMetricDataCommandInput,
} from '@aws-sdk/client-cloudwatch';

/**
 * Test results summary
 */
export interface TestResults {
  /** Total number of tests */
  total: number;
  
  /** Number of passed tests */
  passed: number;
  
  /** Number of failed tests */
  failed: number;
  
  /** Number of skipped tests */
  skipped: number;
}

/**
 * Rollback level
 */
export type RollbackLevel = 'stage' | 'full';

/**
 * Pipeline Metrics Publisher
 * 
 * Publishes custom metrics to CloudWatch for pipeline monitoring and alerting.
 */
export class PipelineMetrics {
  private readonly client: CloudWatchClient;
  private readonly namespace = 'KiroPipeline';
  
  /**
   * Create a new Pipeline Metrics Publisher
   * 
   * @param region - AWS region (defaults to us-east-1)
   */
  constructor(region: string = 'us-east-1') {
    this.client = new CloudWatchClient({ region });
  }
  
  /**
   * Publish deployment duration metric
   * 
   * Records how long a deployment took for a specific environment.
   * 
   * @param environment - Environment name (test, staging, production)
   * @param durationSeconds - Duration in seconds
   * @returns Promise that resolves when metric is published
   */
  async publishDeploymentDuration(
    environment: string,
    durationSeconds: number
  ): Promise<void> {
    try {
      const input: PutMetricDataCommandInput = {
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: 'DeploymentDuration',
            Value: durationSeconds,
            Unit: 'Seconds',
            Dimensions: [
              {
                Name: 'Environment',
                Value: environment,
              },
            ],
            Timestamp: new Date(),
          },
        ],
      };
      
      const command = new PutMetricDataCommand(input);
      await this.client.send(command);
      
      this.log('info', 'Published deployment duration metric', {
        environment,
        durationSeconds,
      });
    } catch (error) {
      // Log error but don't fail deployment
      this.log('error', 'Failed to publish deployment duration metric', {
        environment,
        durationSeconds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Publish rollback metric
   * 
   * Records a rollback event with environment and level.
   * 
   * @param environment - Environment name (test, staging, production)
   * @param level - Rollback level (stage or full)
   * @returns Promise that resolves when metric is published
   */
  async publishRollback(
    environment: string,
    level: RollbackLevel
  ): Promise<void> {
    try {
      const input: PutMetricDataCommandInput = {
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: 'RollbackCount',
            Value: 1,
            Unit: 'Count',
            Dimensions: [
              {
                Name: 'Environment',
                Value: environment,
              },
              {
                Name: 'Level',
                Value: level,
              },
            ],
            Timestamp: new Date(),
          },
        ],
      };
      
      const command = new PutMetricDataCommand(input);
      await this.client.send(command);
      
      this.log('info', 'Published rollback metric', {
        environment,
        rollbackLevel: level,
      });
    } catch (error) {
      // Log error but don't fail deployment
      this.log('error', 'Failed to publish rollback metric', {
        environment,
        rollbackLevel: level,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Publish test results metric
   * 
   * Calculates and publishes test success rate as a percentage.
   * 
   * @param testType - Type of test (unit, integration, e2e)
   * @param results - Test results summary
   * @returns Promise that resolves when metric is published
   */
  async publishTestResults(
    testType: string,
    results: TestResults
  ): Promise<void> {
    try {
      // Calculate success rate
      const successRate = results.total > 0
        ? (results.passed / results.total) * 100
        : 0;
      
      const input: PutMetricDataCommandInput = {
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: 'TestSuccessRate',
            Value: successRate,
            Unit: 'Percent',
            Dimensions: [
              {
                Name: 'TestType',
                Value: testType,
              },
            ],
            Timestamp: new Date(),
          },
        ],
      };
      
      const command = new PutMetricDataCommand(input);
      await this.client.send(command);
      
      this.log('info', 'Published test results metric', {
        testType,
        successRate,
        total: results.total,
        passed: results.passed,
        failed: results.failed,
      });
    } catch (error) {
      // Log error but don't fail deployment
      this.log('error', 'Failed to publish test results metric', {
        testType,
        results,
        error: error instanceof Error ? error.message : String(error),
      });
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
      component: 'PipelineMetrics',
      ...context,
    };
    
    console.log(JSON.stringify(logEntry));
  }
}
