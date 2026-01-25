/**
 * Steering Synchronizer - Ensures repository has up-to-date steering files from Kiro Power
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import simpleGit, { SimpleGit } from 'simple-git';
import { VersionInfo, SyncResult } from '../types';
import { ValidationError } from '../errors';
import { logger } from '../utils/logger';

export interface SteeringSynchronizerConfig {
  readonly repoPath: string;
  readonly powerPath: string;
  readonly steeringDir?: string;
}

export interface ManifestFile {
  readonly path: string;
  readonly checksum: string;
  readonly required: boolean;
  readonly description?: string;
}

export interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly steeringFiles: ManifestFile[];
}

export class SteeringSynchronizer {
  private readonly config: SteeringSynchronizerConfig;
  private readonly git: SimpleGit;
  private readonly steeringPath: string;
  private readonly localManifestPath: string;
  private readonly powerManifestPath: string;

  constructor(config: SteeringSynchronizerConfig) {
    this.config = config;
    this.git = simpleGit(config.repoPath);
    this.steeringPath = path.join(
      config.repoPath,
      config.steeringDir || '.kiro/steering'
    );
    this.localManifestPath = path.join(this.steeringPath, 'manifest.json');
    this.powerManifestPath = path.join(config.powerPath, 'manifest.json');
  }

  /**
   * Check steering version and identify outdated/missing files
   */
  async checkSteeringVersion(): Promise<VersionInfo> {
    logger.info('Checking steering version');

    try {
      // Load power manifest (latest version)
      const powerManifest = await this.loadManifest(this.powerManifestPath);
      const latestVersion = powerManifest.version;

      // Try to load local manifest (current version)
      let currentVersion = '0.0.0';
      let localManifest: Manifest | null = null;

      try {
        localManifest = await this.loadManifest(this.localManifestPath);
        currentVersion = localManifest.version;
      } catch (error) {
        logger.info('No local manifest found, treating as initial sync');
      }

      // Compare versions
      const isOutdated = this.compareVersions(currentVersion, latestVersion) < 0;

      // Identify missing files
      const missingFiles: string[] = [];

      for (const file of powerManifest.steeringFiles) {
        const localFilePath = path.join(this.config.repoPath, file.path);
        
        try {
          await fs.access(localFilePath);
          
          // File exists, check if checksum matches
          const localChecksum = await this.calculateChecksum(localFilePath);
          if (localChecksum !== file.checksum) {
            missingFiles.push(file.path);
          }
        } catch {
          // File doesn't exist
          missingFiles.push(file.path);
        }
      }

      const versionInfo: VersionInfo = {
        currentVersion,
        latestVersion,
        isOutdated: isOutdated || missingFiles.length > 0,
        missingFiles
      };

      logger.info('Steering version check complete', versionInfo);
      return versionInfo;
    } catch (error) {
      const checkError = new ValidationError(
        'Failed to check steering version',
        [],
        error instanceof Error ? error : undefined
      );
      logger.error('Steering version check failed', checkError);
      throw checkError;
    }
  }

  /**
   * Synchronize steering files from Kiro Power
   */
  async synchronizeSteeringFiles(): Promise<SyncResult> {
    logger.info('Synchronizing steering files');

    const addedFiles: string[] = [];
    const updatedFiles: string[] = [];
    const errors: string[] = [];

    try {
      // Ensure steering directory exists
      await fs.mkdir(this.steeringPath, { recursive: true });

      // Load power manifest
      const powerManifest = await this.loadManifest(this.powerManifestPath);

      // Synchronize each steering file
      for (const file of powerManifest.steeringFiles) {
        try {
          const sourcePath = path.join(this.config.powerPath, file.path);
          const targetPath = path.join(this.config.repoPath, file.path);

          // Check if file exists locally
          let fileExists = false;
          try {
            await fs.access(targetPath);
            fileExists = true;
          } catch {
            fileExists = false;
          }

          // Check if file needs updating
          let needsUpdate = true;
          if (fileExists) {
            const localChecksum = await this.calculateChecksum(targetPath);
            needsUpdate = localChecksum !== file.checksum;
          }

          if (needsUpdate) {
            // Ensure target directory exists
            const targetDir = path.dirname(targetPath);
            await fs.mkdir(targetDir, { recursive: true });

            // Copy file from power to repo
            await fs.copyFile(sourcePath, targetPath);

            // Verify checksum after copy
            const copiedChecksum = await this.calculateChecksum(targetPath);
            if (copiedChecksum !== file.checksum) {
              errors.push(
                `Checksum mismatch after copying ${file.path}: expected ${file.checksum}, got ${copiedChecksum}`
              );
              continue;
            }

            if (fileExists) {
              updatedFiles.push(file.path);
              logger.info('Updated steering file', { path: file.path });
            } else {
              addedFiles.push(file.path);
              logger.info('Added steering file', { path: file.path });
            }
          }
        } catch (error) {
          const errorMsg = `Failed to synchronize ${file.path}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          errors.push(errorMsg);
          logger.error('File synchronization failed', error, { path: file.path });
        }
      }

      // Copy manifest to local steering directory
      try {
        await fs.copyFile(this.powerManifestPath, this.localManifestPath);
        logger.info('Updated local manifest');
      } catch (error) {
        errors.push(
          `Failed to update local manifest: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      const result: SyncResult = {
        addedFiles,
        updatedFiles,
        errors
      };

      logger.info('Steering synchronization complete', {
        added: addedFiles.length,
        updated: updatedFiles.length,
        errors: errors.length
      });

      return result;
    } catch (error) {
      const syncError = new ValidationError(
        'Failed to synchronize steering files',
        errors,
        error instanceof Error ? error : undefined
      );
      logger.error('Steering synchronization failed', syncError);
      throw syncError;
    }
  }

  /**
   * Commit steering updates to the current branch
   */
  async commitSteeringUpdates(files: string[]): Promise<void> {
    if (files.length === 0) {
      logger.info('No steering files to commit');
      return;
    }

    logger.info('Committing steering updates', { fileCount: files.length });

    try {
      // Add manifest file
      const manifestRelativePath = path.relative(
        this.config.repoPath,
        this.localManifestPath
      );
      const allFiles = [...files, manifestRelativePath];

      // Add files to git
      await this.git.add(allFiles);

      // Create commit message
      const message = this.generateCommitMessage(files);

      // Commit changes
      await this.git.commit(message);

      logger.info('Steering updates committed successfully', { message });
    } catch (error) {
      const commitError = new ValidationError(
        'Failed to commit steering updates',
        [],
        error instanceof Error ? error : undefined
      );
      logger.error('Steering commit failed', commitError);
      throw commitError;
    }
  }

  /**
   * Load manifest from file
   */
  private async loadManifest(manifestPath: string): Promise<Manifest> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as Manifest;

      // Validate manifest structure
      if (!manifest.name || !manifest.version || !manifest.steeringFiles) {
        throw new Error('Invalid manifest structure');
      }

      return manifest;
    } catch (error) {
      throw new Error(
        `Failed to load manifest from ${manifestPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Calculate SHA-256 checksum of a file
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256');
      hash.update(content);
      return `sha256:${hash.digest('hex')}`;
    } catch (error) {
      throw new Error(
        `Failed to calculate checksum for ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Compare semantic versions
   * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }

  /**
   * Generate commit message for steering updates
   */
  private generateCommitMessage(files: string[]): string {
    const fileList = files.map((f) => `  - ${f}`).join('\n');
    return `chore(steering): synchronize steering files from Kiro Power

Updated steering documentation files:
${fileList}

These files were synchronized from the centralized Kiro Power
to ensure the repository follows current coding standards and
best practices.`;
  }
}
