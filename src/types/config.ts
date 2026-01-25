/**
 * Configuration types for the Kiro Worker
 */

export interface WorkerConfig {
  readonly environment: 'test' | 'staging' | 'production';
  readonly branchName: string;
  readonly specPath: string;
  readonly taskId?: string;
  readonly coverageThreshold: number;
  readonly repoPath: string;
}

export interface TestConfig {
  readonly testCommand?: string;
  readonly coverageCommand?: string;
  readonly coverageThreshold: number;
}

export interface ProjectConfig {
  readonly organization: string;
  readonly repository: string;
  readonly projectNumber: number;
  readonly targetStatusColumn: string;
}

export interface ExecutionOptions {
  readonly specPath: string;
  readonly taskId: string;
  readonly customArgs?: string[];
  readonly timeout?: number;
}
