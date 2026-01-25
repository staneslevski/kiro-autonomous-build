/**
 * Steering synchronization types
 */

export interface VersionInfo {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly isOutdated: boolean;
  readonly missingFiles: string[];
}

export interface SyncResult {
  readonly addedFiles: string[];
  readonly updatedFiles: string[];
  readonly errors: string[];
}
