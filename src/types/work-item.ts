/**
 * Work item types for GitHub Projects integration
 */

export interface WorkItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly branchName: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly priority?: number;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly branchExists: boolean;
  readonly specFolderExists: boolean;
  readonly specFolderMatchesBranch: boolean;
  readonly pullRequestExists: boolean;
  readonly pullRequestMatchesBranch: boolean;
  readonly requiredFilesExist?: {
    readonly requirements: boolean;
    readonly design: boolean;
    readonly tasks: boolean;
  };
  readonly errors: string[];
}

export interface LockResult {
  readonly acquired: boolean;
  readonly lockId: string;
  readonly expiresAt: Date;
  readonly reason?: string;
}
