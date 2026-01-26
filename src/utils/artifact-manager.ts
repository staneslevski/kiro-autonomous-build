/**
 * Artifact Manager for uploading build artifacts to S3
 * 
 * Handles uploading logs, test results, coverage reports, and diffs to S3
 * with organized structure: {environment}/{build-id}/logs/, reports/, diffs/, metadata.json
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ArtifactManagerConfig {
  bucketName: string;
  region?: string;
  enabled?: boolean;
}

export interface ArtifactMetadata {
  buildId: string;
  environment: string;
  branchName: string;
  timestamp: Date;
  success: boolean;
  duration: number;
  testResults?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
  coverage?: {
    percentage: number;
  };
}

export interface UploadResult {
  success: boolean;
  key: string;
  url?: string;
  error?: string;
}

/**
 * Artifact Manager for S3 uploads
 */
export class ArtifactManager {
  private readonly client: S3Client;
  private readonly config: ArtifactManagerConfig;

  constructor(config: ArtifactManagerConfig) {
    this.config = {
      enabled: true,
      region: process.env.AWS_REGION || 'us-east-1',
      ...config
    };

    this.client = new S3Client({
      region: this.config.region
    });
  }

  /**
   * Upload log file to S3
   */
  async uploadLog(
    environment: string,
    buildId: string,
    logName: string,
    logContent: string
  ): Promise<UploadResult> {
    const key = this.getArtifactKey(environment, buildId, 'logs', logName);
    return this.uploadArtifact(key, logContent, 'text/plain');
  }

  /**
   * Upload test results to S3
   */
  async uploadTestResults(
    environment: string,
    buildId: string,
    testResults: unknown
  ): Promise<UploadResult> {
    const key = this.getArtifactKey(environment, buildId, 'reports', 'test-results.json');
    return this.uploadArtifact(key, JSON.stringify(testResults, null, 2), 'application/json');
  }

  /**
   * Upload coverage report to S3
   */
  async uploadCoverageReport(
    environment: string,
    buildId: string,
    coverageData: unknown
  ): Promise<UploadResult> {
    const key = this.getArtifactKey(environment, buildId, 'reports', 'coverage.json');
    return this.uploadArtifact(key, JSON.stringify(coverageData, null, 2), 'application/json');
  }

  /**
   * Upload diff file to S3
   */
  async uploadDiff(
    environment: string,
    buildId: string,
    diffContent: string
  ): Promise<UploadResult> {
    const key = this.getArtifactKey(environment, buildId, 'diffs', 'changes.diff');
    return this.uploadArtifact(key, diffContent, 'text/plain');
  }

  /**
   * Upload metadata file to S3
   */
  async uploadMetadata(
    environment: string,
    buildId: string,
    metadata: ArtifactMetadata
  ): Promise<UploadResult> {
    const key = this.getArtifactKey(environment, buildId, '', 'metadata.json');
    return this.uploadArtifact(key, JSON.stringify(metadata, null, 2), 'application/json');
  }

  /**
   * Upload file from filesystem to S3
   */
  async uploadFile(
    environment: string,
    buildId: string,
    category: 'logs' | 'reports' | 'diffs',
    filePath: string
  ): Promise<UploadResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        key: '',
        error: 'Artifact upload disabled'
      };
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      const key = this.getArtifactKey(environment, buildId, category, fileName);
      
      return this.uploadArtifact(key, content, this.getContentType(fileName));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to upload file', {
        filePath,
        error: errorMessage
      });

      return {
        success: false,
        key: '',
        error: errorMessage
      };
    }
  }

  /**
   * Upload directory of files to S3
   */
  async uploadDirectory(
    environment: string,
    buildId: string,
    category: 'logs' | 'reports' | 'diffs',
    dirPath: string
  ): Promise<UploadResult[]> {
    if (!this.config.enabled) {
      return [{
        success: false,
        key: '',
        error: 'Artifact upload disabled'
      }];
    }

    try {
      const files = await fs.readdir(dirPath);
      const results: UploadResult[] = [];

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const result = await this.uploadFile(environment, buildId, category, filePath);
          results.push(result);
        }
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to upload directory', {
        dirPath,
        error: errorMessage
      });

      return [{
        success: false,
        key: '',
        error: errorMessage
      }];
    }
  }

  /**
   * Upload all build artifacts
   */
  async uploadAllArtifacts(
    environment: string,
    buildId: string,
    artifacts: {
      logs?: string[];
      testResults?: unknown;
      coverage?: unknown;
      diff?: string;
      metadata: ArtifactMetadata;
    }
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    // Upload logs
    if (artifacts.logs) {
      for (const logPath of artifacts.logs) {
        const result = await this.uploadFile(environment, buildId, 'logs', logPath);
        results.push(result);
      }
    }

    // Upload test results
    if (artifacts.testResults) {
      const result = await this.uploadTestResults(environment, buildId, artifacts.testResults);
      results.push(result);
    }

    // Upload coverage
    if (artifacts.coverage) {
      const result = await this.uploadCoverageReport(environment, buildId, artifacts.coverage);
      results.push(result);
    }

    // Upload diff
    if (artifacts.diff) {
      const result = await this.uploadDiff(environment, buildId, artifacts.diff);
      results.push(result);
    }

    // Upload metadata
    const metadataResult = await this.uploadMetadata(environment, buildId, artifacts.metadata);
    results.push(metadataResult);

    return results;
  }

  /**
   * Get S3 key for artifact
   */
  private getArtifactKey(
    environment: string,
    buildId: string,
    category: string,
    fileName: string
  ): string {
    const parts = [environment, buildId];
    
    if (category) {
      parts.push(category);
    }
    
    parts.push(fileName);
    
    return parts.join('/');
  }

  /**
   * Upload artifact to S3
   */
  private async uploadArtifact(
    key: string,
    content: string,
    contentType: string
  ): Promise<UploadResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        key,
        error: 'Artifact upload disabled'
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType
      });

      await this.client.send(command);

      const url = `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;

      logger.info('Uploaded artifact to S3', {
        key,
        bucket: this.config.bucketName,
        size: content.length
      });

      return {
        success: true,
        key,
        url
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to upload artifact to S3', {
        key,
        bucket: this.config.bucketName,
        error: errorMessage
      });

      return {
        success: false,
        key,
        error: errorMessage
      };
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    
    const contentTypes: Record<string, string> = {
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.log': 'text/plain',
      '.diff': 'text/plain',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.csv': 'text/csv'
    };

    return contentTypes[ext] || 'application/octet-stream';
  }
}
