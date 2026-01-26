/**
 * Configuration types for the Kiro Worker
 */

import type { TestResult, CoverageResult } from './test-result';

export interface WorkerConfig {
  readonly environment: 'test' | 'staging' | 'production';
  readonly branchName: string;
  readonly specPath: string;
  readonly taskId?: string;
  readonly coverageThreshold: number;
  readonly repoPath: string;
  readonly buildId?: string;
  readonly buildUrl?: string;
  readonly targetBranch?: string;
  readonly testCommand?: string;
  readonly coverageCommand?: string;
  readonly timeout?: number;
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

export type PipelinePhase = 'checkout' | 'steering' | 'kiro-cli' | 'tests' | 'pull-request';

export interface PhaseResult {
  readonly name: PipelinePhase;
  readonly success: boolean;
  readonly duration: number;
  readonly error?: string;
}

export interface WorkerResult {
  success: boolean;
  buildId: string;
  environment: string;
  branchName: string;
  phases: PhaseResult[];
  duration: number;
  errors: string[];
  modifiedFiles?: string[];
  kiroOutput?: string;
  testResult?: TestResult;
  coverageResult?: CoverageResult;
  prUrl?: string;
}
