import { describe, it, expect } from 'vitest';
import { Duration } from 'aws-cdk-lib';
import type {
  PipelineConfig,
  PipelineEnvironmentConfig,
  BuildConfig,
  MonitoringConfig
} from '../../lib/types/pipeline-config';

describe('Pipeline Config Types', () => {
  describe('PipelineConfig Interface', () => {
    it('should create a complete pipeline configuration', () => {
      const config: PipelineConfig = {
        environment: 'test',
        account: '123456789012',
        region: 'us-east-1',
        githubOwner: 'my-org',
        githubRepo: 'kiro-codebuild-worker',
        githubBranch: 'main',
        environmentConfig: {
          pipelineEnabled: true,
          healthCheckDuration: Duration.minutes(5),
          alarmPrefixes: ['kiro-worker-test-', 'kiro-pipeline-test-'],
          requiresApproval: false,
          parallelTests: true,
          maxConcurrentDeployments: 1
        },
        buildConfig: {
          nodeVersion: '18',
          computeType: 'SMALL',
          buildTimeout: 60,
          testTimeout: 30,
          coverageThreshold: 80,
          enableCache: true,
          cachePaths: ['node_modules/**/*', 'infrastructure/node_modules/**/*'],
          environmentVariables: {
            ENVIRONMENT: 'test',
            COVERAGE_THRESHOLD: '80'
          },
          securityScan: {
            enableCfnGuard: true,
            enableCfnLint: true,
            enableNpmAudit: true,
            npmAuditLevel: 'high'
          }
        },
        monitoringConfig: {
          enableDashboard: true,
          dashboardRefreshInterval: 60,
          alarms: {
            pipelineFailureThreshold: 3,
            pipelineFailureEvaluationPeriod: 60,
            rollbackThreshold: 2,
            rollbackEvaluationPeriod: 60,
            deploymentDurationThreshold: 60,
            enableAlarmActions: true
          },
          notifications: {
            emailAddresses: ['devops@example.com'],
            notifyOnSuccess: true,
            notifyOnFailure: true,
            notifyOnRollback: true
          },
          logging: {
            retentionDays: 90,
            enableEncryption: true,
            logLevel: 'INFO'
          },
          metrics: {
            namespace: 'KiroPipeline',
            publishInterval: 60,
            enableDetailedMetrics: true
          }
        }
      };

      expect(config.environment).toBe('test');
      expect(config.account).toBe('123456789012');
      expect(config.region).toBe('us-east-1');
      expect(config.githubOwner).toBe('my-org');
      expect(config.githubRepo).toBe('kiro-codebuild-worker');
      expect(config.githubBranch).toBe('main');
    });

    it('should create production pipeline configuration with approval', () => {
      const config: PipelineConfig = {
        environment: 'production',
        account: '123456789012',
        region: 'us-east-1',
        githubOwner: 'my-org',
        githubRepo: 'kiro-codebuild-worker',
        githubBranch: 'main',
        environmentConfig: {
          pipelineEnabled: true,
          healthCheckDuration: Duration.minutes(10),
          alarmPrefixes: ['kiro-worker-production-'],
          requiresApproval: true,
          approvalTimeout: 24,
          parallelTests: false,
          maxConcurrentDeployments: 1
        },
        buildConfig: {
          nodeVersion: '18',
          computeType: 'MEDIUM',
          buildTimeout: 90,
          testTimeout: 45,
          coverageThreshold: 85,
          enableCache: true,
          cachePaths: ['node_modules/**/*'],
          environmentVariables: {},
          securityScan: {
            enableCfnGuard: true,
            enableCfnLint: true,
            enableNpmAudit: true,
            npmAuditLevel: 'high'
          }
        },
        monitoringConfig: {
          enableDashboard: true,
          dashboardRefreshInterval: 30,
          alarms: {
            pipelineFailureThreshold: 1,
            pipelineFailureEvaluationPeriod: 30,
            rollbackThreshold: 1,
            rollbackEvaluationPeriod: 30,
            deploymentDurationThreshold: 90,
            enableAlarmActions: true
          },
          notifications: {
            emailAddresses: ['devops@example.com', 'oncall@example.com'],
            slackWebhookUrl: 'https://hooks.slack.com/services/xxx',
            notifyOnSuccess: true,
            notifyOnFailure: true,
            notifyOnRollback: true
          },
          logging: {
            retentionDays: 365,
            enableEncryption: true,
            logLevel: 'INFO'
          },
          metrics: {
            namespace: 'KiroPipeline',
            publishInterval: 30,
            enableDetailedMetrics: true
          }
        }
      };

      expect(config.environment).toBe('production');
      expect(config.environmentConfig.requiresApproval).toBe(true);
      expect(config.environmentConfig.approvalTimeout).toBe(24);
      expect(config.buildConfig.computeType).toBe('MEDIUM');
    });
  });

  describe('PipelineEnvironmentConfig Interface', () => {
    it('should create environment config for test environment', () => {
      const config: PipelineEnvironmentConfig = {
        pipelineEnabled: true,
        healthCheckDuration: Duration.minutes(5),
        alarmPrefixes: ['kiro-worker-test-'],
        requiresApproval: false,
        parallelTests: true,
        maxConcurrentDeployments: 1
      };

      expect(config.pipelineEnabled).toBe(true);
      expect(config.healthCheckDuration.toMinutes()).toBe(5);
      expect(config.alarmPrefixes).toContain('kiro-worker-test-');
      expect(config.requiresApproval).toBe(false);
      expect(config.parallelTests).toBe(true);
      expect(config.maxConcurrentDeployments).toBe(1);
    });

    it('should create environment config with approval timeout', () => {
      const config: PipelineEnvironmentConfig = {
        pipelineEnabled: true,
        healthCheckDuration: Duration.minutes(10),
        alarmPrefixes: ['kiro-worker-production-'],
        requiresApproval: true,
        approvalTimeout: 24,
        parallelTests: false,
        maxConcurrentDeployments: 1
      };

      expect(config.requiresApproval).toBe(true);
      expect(config.approvalTimeout).toBe(24);
    });

    it('should support multiple alarm prefixes', () => {
      const config: PipelineEnvironmentConfig = {
        pipelineEnabled: true,
        healthCheckDuration: Duration.minutes(5),
        alarmPrefixes: [
          'kiro-worker-staging-',
          'kiro-pipeline-staging-',
          'custom-alarm-'
        ],
        requiresApproval: false,
        parallelTests: true,
        maxConcurrentDeployments: 2
      };

      expect(config.alarmPrefixes).toHaveLength(3);
      expect(config.maxConcurrentDeployments).toBe(2);
    });

    it('should work with different Duration values', () => {
      const config1: PipelineEnvironmentConfig = {
        pipelineEnabled: true,
        healthCheckDuration: Duration.seconds(300),
        alarmPrefixes: ['test-'],
        requiresApproval: false,
        parallelTests: true,
        maxConcurrentDeployments: 1
      };

      const config2: PipelineEnvironmentConfig = {
        pipelineEnabled: true,
        healthCheckDuration: Duration.minutes(10),
        alarmPrefixes: ['test-'],
        requiresApproval: false,
        parallelTests: true,
        maxConcurrentDeployments: 1
      };

      expect(config1.healthCheckDuration.toSeconds()).toBe(300);
      expect(config2.healthCheckDuration.toMinutes()).toBe(10);
    });
  });

  describe('BuildConfig Interface', () => {
    it('should create build config with all security scans enabled', () => {
      const config: BuildConfig = {
        nodeVersion: '18',
        computeType: 'SMALL',
        buildTimeout: 60,
        testTimeout: 30,
        coverageThreshold: 80,
        enableCache: true,
        cachePaths: ['node_modules/**/*', '.npm/**/*'],
        environmentVariables: {
          ENVIRONMENT: 'test',
          COVERAGE_THRESHOLD: '80',
          NODE_ENV: 'test'
        },
        securityScan: {
          enableCfnGuard: true,
          enableCfnLint: true,
          enableNpmAudit: true,
          npmAuditLevel: 'high'
        }
      };

      expect(config.nodeVersion).toBe('18');
      expect(config.computeType).toBe('SMALL');
      expect(config.buildTimeout).toBe(60);
      expect(config.testTimeout).toBe(30);
      expect(config.coverageThreshold).toBe(80);
      expect(config.enableCache).toBe(true);
      expect(config.securityScan.enableCfnGuard).toBe(true);
      expect(config.securityScan.enableCfnLint).toBe(true);
      expect(config.securityScan.enableNpmAudit).toBe(true);
    });

    it('should support different compute types', () => {
      const smallConfig: BuildConfig = {
        nodeVersion: '18',
        computeType: 'SMALL',
        buildTimeout: 60,
        testTimeout: 30,
        coverageThreshold: 80,
        enableCache: true,
        cachePaths: [],
        environmentVariables: {},
        securityScan: {
          enableCfnGuard: true,
          enableCfnLint: true,
          enableNpmAudit: true,
          npmAuditLevel: 'high'
        }
      };

      const mediumConfig: BuildConfig = {
        ...smallConfig,
        computeType: 'MEDIUM'
      };

      const largeConfig: BuildConfig = {
        ...smallConfig,
        computeType: 'LARGE'
      };

      expect(smallConfig.computeType).toBe('SMALL');
      expect(mediumConfig.computeType).toBe('MEDIUM');
      expect(largeConfig.computeType).toBe('LARGE');
    });

    it('should support different npm audit levels', () => {
      const levels: Array<'low' | 'moderate' | 'high' | 'critical'> = [
        'low',
        'moderate',
        'high',
        'critical'
      ];

      levels.forEach((level) => {
        const config: BuildConfig = {
          nodeVersion: '18',
          computeType: 'SMALL',
          buildTimeout: 60,
          testTimeout: 30,
          coverageThreshold: 80,
          enableCache: true,
          cachePaths: [],
          environmentVariables: {},
          securityScan: {
            enableCfnGuard: true,
            enableCfnLint: true,
            enableNpmAudit: true,
            npmAuditLevel: level
          }
        };

        expect(config.securityScan.npmAuditLevel).toBe(level);
      });
    });

    it('should support disabling security scans', () => {
      const config: BuildConfig = {
        nodeVersion: '18',
        computeType: 'SMALL',
        buildTimeout: 60,
        testTimeout: 30,
        coverageThreshold: 80,
        enableCache: false,
        cachePaths: [],
        environmentVariables: {},
        securityScan: {
          enableCfnGuard: false,
          enableCfnLint: false,
          enableNpmAudit: false,
          npmAuditLevel: 'high'
        }
      };

      expect(config.enableCache).toBe(false);
      expect(config.securityScan.enableCfnGuard).toBe(false);
      expect(config.securityScan.enableCfnLint).toBe(false);
      expect(config.securityScan.enableNpmAudit).toBe(false);
    });

    it('should validate coverage threshold range', () => {
      const config: BuildConfig = {
        nodeVersion: '18',
        computeType: 'SMALL',
        buildTimeout: 60,
        testTimeout: 30,
        coverageThreshold: 85,
        enableCache: true,
        cachePaths: [],
        environmentVariables: {},
        securityScan: {
          enableCfnGuard: true,
          enableCfnLint: true,
          enableNpmAudit: true,
          npmAuditLevel: 'high'
        }
      };

      expect(config.coverageThreshold).toBeGreaterThanOrEqual(0);
      expect(config.coverageThreshold).toBeLessThanOrEqual(100);
    });
  });

  describe('MonitoringConfig Interface', () => {
    it('should create complete monitoring configuration', () => {
      const config: MonitoringConfig = {
        enableDashboard: true,
        dashboardRefreshInterval: 60,
        alarms: {
          pipelineFailureThreshold: 3,
          pipelineFailureEvaluationPeriod: 60,
          rollbackThreshold: 2,
          rollbackEvaluationPeriod: 60,
          deploymentDurationThreshold: 60,
          enableAlarmActions: true
        },
        notifications: {
          emailAddresses: ['devops@example.com', 'team@example.com'],
          slackWebhookUrl: 'https://hooks.slack.com/services/xxx',
          notifyOnSuccess: true,
          notifyOnFailure: true,
          notifyOnRollback: true
        },
        logging: {
          retentionDays: 90,
          enableEncryption: true,
          logLevel: 'INFO'
        },
        metrics: {
          namespace: 'KiroPipeline',
          publishInterval: 60,
          enableDetailedMetrics: true
        }
      };

      expect(config.enableDashboard).toBe(true);
      expect(config.dashboardRefreshInterval).toBe(60);
      expect(config.alarms.pipelineFailureThreshold).toBe(3);
      expect(config.notifications.emailAddresses).toHaveLength(2);
      expect(config.logging.retentionDays).toBe(90);
      expect(config.metrics.namespace).toBe('KiroPipeline');
    });

    it('should support different log levels', () => {
      const levels: Array<'DEBUG' | 'INFO' | 'WARN' | 'ERROR'> = [
        'DEBUG',
        'INFO',
        'WARN',
        'ERROR'
      ];

      levels.forEach((level) => {
        const config: MonitoringConfig = {
          enableDashboard: true,
          dashboardRefreshInterval: 60,
          alarms: {
            pipelineFailureThreshold: 3,
            pipelineFailureEvaluationPeriod: 60,
            rollbackThreshold: 2,
            rollbackEvaluationPeriod: 60,
            deploymentDurationThreshold: 60,
            enableAlarmActions: true
          },
          notifications: {
            emailAddresses: [],
            notifyOnSuccess: false,
            notifyOnFailure: true,
            notifyOnRollback: true
          },
          logging: {
            retentionDays: 90,
            enableEncryption: true,
            logLevel: level
          },
          metrics: {
            namespace: 'KiroPipeline',
            publishInterval: 60,
            enableDetailedMetrics: false
          }
        };

        expect(config.logging.logLevel).toBe(level);
      });
    });

    it('should support notifications without Slack', () => {
      const config: MonitoringConfig = {
        enableDashboard: true,
        dashboardRefreshInterval: 60,
        alarms: {
          pipelineFailureThreshold: 3,
          pipelineFailureEvaluationPeriod: 60,
          rollbackThreshold: 2,
          rollbackEvaluationPeriod: 60,
          deploymentDurationThreshold: 60,
          enableAlarmActions: true
        },
        notifications: {
          emailAddresses: ['devops@example.com'],
          notifyOnSuccess: false,
          notifyOnFailure: true,
          notifyOnRollback: true
        },
        logging: {
          retentionDays: 90,
          enableEncryption: true,
          logLevel: 'INFO'
        },
        metrics: {
          namespace: 'KiroPipeline',
          publishInterval: 60,
          enableDetailedMetrics: true
        }
      };

      expect(config.notifications.slackWebhookUrl).toBeUndefined();
      expect(config.notifications.emailAddresses).toHaveLength(1);
    });

    it('should support disabling alarm actions', () => {
      const config: MonitoringConfig = {
        enableDashboard: false,
        dashboardRefreshInterval: 60,
        alarms: {
          pipelineFailureThreshold: 5,
          pipelineFailureEvaluationPeriod: 120,
          rollbackThreshold: 3,
          rollbackEvaluationPeriod: 120,
          deploymentDurationThreshold: 90,
          enableAlarmActions: false
        },
        notifications: {
          emailAddresses: [],
          notifyOnSuccess: false,
          notifyOnFailure: false,
          notifyOnRollback: false
        },
        logging: {
          retentionDays: 30,
          enableEncryption: false,
          logLevel: 'WARN'
        },
        metrics: {
          namespace: 'KiroPipeline',
          publishInterval: 120,
          enableDetailedMetrics: false
        }
      };

      expect(config.enableDashboard).toBe(false);
      expect(config.alarms.enableAlarmActions).toBe(false);
      expect(config.notifications.notifyOnSuccess).toBe(false);
      expect(config.logging.enableEncryption).toBe(false);
      expect(config.metrics.enableDetailedMetrics).toBe(false);
    });

    it('should support different retention periods', () => {
      const retentionPeriods = [7, 30, 90, 180, 365];

      retentionPeriods.forEach((days) => {
        const config: MonitoringConfig = {
          enableDashboard: true,
          dashboardRefreshInterval: 60,
          alarms: {
            pipelineFailureThreshold: 3,
            pipelineFailureEvaluationPeriod: 60,
            rollbackThreshold: 2,
            rollbackEvaluationPeriod: 60,
            deploymentDurationThreshold: 60,
            enableAlarmActions: true
          },
          notifications: {
            emailAddresses: [],
            notifyOnSuccess: false,
            notifyOnFailure: true,
            notifyOnRollback: true
          },
          logging: {
            retentionDays: days,
            enableEncryption: true,
            logLevel: 'INFO'
          },
          metrics: {
            namespace: 'KiroPipeline',
            publishInterval: 60,
            enableDetailedMetrics: true
          }
        };

        expect(config.logging.retentionDays).toBe(days);
      });
    });
  });

  describe('Type Compatibility and Integration', () => {
    it('should allow nested config objects to be used independently', () => {
      const envConfig: PipelineEnvironmentConfig = {
        pipelineEnabled: true,
        healthCheckDuration: Duration.minutes(5),
        alarmPrefixes: ['test-'],
        requiresApproval: false,
        parallelTests: true,
        maxConcurrentDeployments: 1
      };

      const buildConfig: BuildConfig = {
        nodeVersion: '18',
        computeType: 'SMALL',
        buildTimeout: 60,
        testTimeout: 30,
        coverageThreshold: 80,
        enableCache: true,
        cachePaths: [],
        environmentVariables: {},
        securityScan: {
          enableCfnGuard: true,
          enableCfnLint: true,
          enableNpmAudit: true,
          npmAuditLevel: 'high'
        }
      };

      const monitoringConfig: MonitoringConfig = {
        enableDashboard: true,
        dashboardRefreshInterval: 60,
        alarms: {
          pipelineFailureThreshold: 3,
          pipelineFailureEvaluationPeriod: 60,
          rollbackThreshold: 2,
          rollbackEvaluationPeriod: 60,
          deploymentDurationThreshold: 60,
          enableAlarmActions: true
        },
        notifications: {
          emailAddresses: [],
          notifyOnSuccess: false,
          notifyOnFailure: true,
          notifyOnRollback: true
        },
        logging: {
          retentionDays: 90,
          enableEncryption: true,
          logLevel: 'INFO'
        },
        metrics: {
          namespace: 'KiroPipeline',
          publishInterval: 60,
          enableDetailedMetrics: true
        }
      };

      const fullConfig: PipelineConfig = {
        environment: 'test',
        account: '123456789012',
        region: 'us-east-1',
        githubOwner: 'my-org',
        githubRepo: 'my-repo',
        githubBranch: 'main',
        environmentConfig: envConfig,
        buildConfig: buildConfig,
        monitoringConfig: monitoringConfig
      };

      expect(fullConfig.environmentConfig).toBe(envConfig);
      expect(fullConfig.buildConfig).toBe(buildConfig);
      expect(fullConfig.monitoringConfig).toBe(monitoringConfig);
    });

    it('should support partial config updates', () => {
      const baseConfig: PipelineConfig = {
        environment: 'test',
        account: '123456789012',
        region: 'us-east-1',
        githubOwner: 'my-org',
        githubRepo: 'my-repo',
        githubBranch: 'main',
        environmentConfig: {
          pipelineEnabled: true,
          healthCheckDuration: Duration.minutes(5),
          alarmPrefixes: ['test-'],
          requiresApproval: false,
          parallelTests: true,
          maxConcurrentDeployments: 1
        },
        buildConfig: {
          nodeVersion: '18',
          computeType: 'SMALL',
          buildTimeout: 60,
          testTimeout: 30,
          coverageThreshold: 80,
          enableCache: true,
          cachePaths: [],
          environmentVariables: {},
          securityScan: {
            enableCfnGuard: true,
            enableCfnLint: true,
            enableNpmAudit: true,
            npmAuditLevel: 'high'
          }
        },
        monitoringConfig: {
          enableDashboard: true,
          dashboardRefreshInterval: 60,
          alarms: {
            pipelineFailureThreshold: 3,
            pipelineFailureEvaluationPeriod: 60,
            rollbackThreshold: 2,
            rollbackEvaluationPeriod: 60,
            deploymentDurationThreshold: 60,
            enableAlarmActions: true
          },
          notifications: {
            emailAddresses: [],
            notifyOnSuccess: false,
            notifyOnFailure: true,
            notifyOnRollback: true
          },
          logging: {
            retentionDays: 90,
            enableEncryption: true,
            logLevel: 'INFO'
          },
          metrics: {
            namespace: 'KiroPipeline',
            publishInterval: 60,
            enableDetailedMetrics: true
          }
        }
      };

      const updatedConfig: PipelineConfig = {
        ...baseConfig,
        environment: 'production',
        buildConfig: {
          ...baseConfig.buildConfig,
          computeType: 'LARGE',
          coverageThreshold: 90
        }
      };

      expect(updatedConfig.environment).toBe('production');
      expect(updatedConfig.buildConfig.computeType).toBe('LARGE');
      expect(updatedConfig.buildConfig.coverageThreshold).toBe(90);
      expect(updatedConfig.buildConfig.nodeVersion).toBe('18');
    });
  });
});
