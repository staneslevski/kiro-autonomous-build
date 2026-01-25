/**
 * Pull request types
 */

import type { TestResult, CoverageResult } from './test-result';

export interface PRDetails {
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly title: string;
  readonly body: string;
  readonly metadata: PRMetadata;
}

export interface PRMetadata {
  readonly buildId: string;
  readonly buildUrl: string;
  readonly specTask: string;
  readonly testSummary: string;
  readonly coveragePercentage: number;
  readonly modifiedFiles: string[];
}

export interface PRResult {
  readonly success: boolean;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly error?: string;
}

export interface PRContext {
  readonly taskId: string;
  readonly testResult: TestResult;
  readonly coverageResult: CoverageResult;
  readonly buildMetadata: BuildMetadata;
}

export interface BuildMetadata {
  readonly buildId: string;
  readonly buildUrl: string;
  readonly environment: string;
  readonly timestamp: Date;
}
