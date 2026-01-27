/**
 * CD Pipeline type definitions
 * 
 * This module exports all type definitions used by the CD pipeline infrastructure.
 * Import types from this module to ensure consistency across the codebase.
 * 
 * @example
 * ```typescript
 * import { DeploymentRecord, PipelineConfig, Environment } from './types';
 * ```
 */

// Export all types from pipeline-types
export type {
  Environment,
  DeploymentStatus,
  RollbackLevel,
  DeploymentRecord,
  AlarmInfo,
  HealthCheckResult,
  TestResults,
  FailedTest,
  SecurityViolation
} from './pipeline-types';

// Export all types from pipeline-config
export type {
  PipelineConfig,
  PipelineEnvironmentConfig,
  BuildConfig,
  MonitoringConfig
} from './pipeline-config';
