/**
 * Unit tests for Artifact Manager
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ArtifactManager, type ArtifactMetadata } from './artifact-manager';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3');

// Mock fs/promises
vi.mock('fs/promises');

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('ArtifactManager', () => {
  let artifactManager: ArtifactManager;
  let mockSend: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSend = vi.fn().mockResolvedValue({});
    (S3Client as unknown as Mock).mockImplementation(() => ({
      send: mockSend
    }));
  });

  describe('constructor', () => {
    it('should create manager with config', () => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });

      expect(artifactManager).toBeDefined();
      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-east-1'
      });
    });

    it('should use custom region', () => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket',
        region: 'us-west-2'
      });

      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-west-2'
      });
    });
  });

  describe('uploadLog', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload log file', async () => {
      const result = await artifactManager.uploadLog(
        'test',
        'build-123',
        'worker.log',
        'Log content'
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/build-123/logs/worker.log');
      expect(result.url).toContain('test-bucket');
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should not upload when disabled', async () => {
      const disabledManager = new ArtifactManager({
        bucketName: 'test-bucket',
        enabled: false
      });

      const result = await disabledManager.uploadLog(
        'test',
        'build-123',
        'worker.log',
        'Log content'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Artifact upload disabled');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle upload error', async () => {
      mockSend.mockRejectedValue(new Error('S3 error'));

      const result = await artifactManager.uploadLog(
        'test',
        'build-123',
        'worker.log',
        'Log content'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('S3 error');
    });
  });

  describe('uploadTestResults', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload test results', async () => {
      const testResults = {
        totalTests: 100,
        passedTests: 95,
        failedTests: 5
      };

      const result = await artifactManager.uploadTestResults(
        'test',
        'build-123',
        testResults
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/build-123/reports/test-results.json');
      expect(mockSend).toHaveBeenCalled();

      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      // Check the command was created with correct parameters
      const input = (command as any).input;
      expect(input.ContentType).toBe('application/json');
      expect(input.Body).toContain('totalTests');
    });
  });

  describe('uploadCoverageReport', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload coverage report', async () => {
      const coverage = {
        lines: 85,
        functions: 90,
        branches: 80
      };

      const result = await artifactManager.uploadCoverageReport(
        'test',
        'build-123',
        coverage
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/build-123/reports/coverage.json');
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('uploadDiff', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload diff file', async () => {
      const diff = `
diff --git a/file.ts b/file.ts
index 123..456
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
+new line
 existing line
      `;

      const result = await artifactManager.uploadDiff(
        'test',
        'build-123',
        diff
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/build-123/diffs/changes.diff');
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('uploadMetadata', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload metadata', async () => {
      const metadata: ArtifactMetadata = {
        buildId: 'build-123',
        environment: 'test',
        branchName: 'feature-test',
        timestamp: new Date('2026-01-26'),
        success: true,
        duration: 120000,
        testResults: {
          totalTests: 100,
          passedTests: 100,
          failedTests: 0
        },
        coverage: {
          percentage: 85
        }
      };

      const result = await artifactManager.uploadMetadata(
        'test',
        'build-123',
        metadata
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/build-123/metadata.json');
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload file from filesystem', async () => {
      (fs.readFile as Mock).mockResolvedValue('File content');

      const result = await artifactManager.uploadFile(
        'test',
        'build-123',
        'logs',
        '/tmp/test.log'
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/build-123/logs/test.log');
      expect(fs.readFile).toHaveBeenCalledWith('/tmp/test.log', 'utf-8');
    });

    it('should handle file read error', async () => {
      (fs.readFile as Mock).mockRejectedValue(new Error('File not found'));

      const result = await artifactManager.uploadFile(
        'test',
        'build-123',
        'logs',
        '/tmp/missing.log'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should detect content type from extension', async () => {
      (fs.readFile as Mock).mockResolvedValue('{}');

      await artifactManager.uploadFile(
        'test',
        'build-123',
        'reports',
        '/tmp/report.json'
      );

      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('application/json');
    });
  });

  describe('uploadDirectory', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should upload all files in directory', async () => {
      (fs.readdir as Mock).mockResolvedValue(['file1.log', 'file2.log']);
      (fs.stat as Mock).mockResolvedValue({ isFile: () => true });
      (fs.readFile as Mock).mockResolvedValue('File content');

      const results = await artifactManager.uploadDirectory(
        'test',
        'build-123',
        'logs',
        '/tmp/logs'
      );

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(fs.readdir).toHaveBeenCalledWith('/tmp/logs');
    });

    it('should skip non-file entries', async () => {
      (fs.readdir as Mock).mockResolvedValue(['file.log', 'subdir']);
      (fs.stat as Mock).mockImplementation((path: string) => {
        if (path.includes('subdir')) {
          return Promise.resolve({ isFile: () => false });
        }
        return Promise.resolve({ isFile: () => true });
      });
      (fs.readFile as Mock).mockResolvedValue('File content');

      const results = await artifactManager.uploadDirectory(
        'test',
        'build-123',
        'logs',
        '/tmp/logs'
      );

      expect(results.length).toBe(1);
      expect(results[0].key).toBe('test/build-123/logs/file.log');
    });

    it('should handle directory read error', async () => {
      (fs.readdir as Mock).mockRejectedValue(new Error('Directory not found'));

      const results = await artifactManager.uploadDirectory(
        'test',
        'build-123',
        'logs',
        '/tmp/missing'
      );

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Directory not found');
    });
  });

  describe('uploadAllArtifacts', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
      (fs.readFile as Mock).mockResolvedValue('File content');
    });

    it('should upload all artifact types', async () => {
      const metadata: ArtifactMetadata = {
        buildId: 'build-123',
        environment: 'test',
        branchName: 'feature-test',
        timestamp: new Date(),
        success: true,
        duration: 120000
      };

      const results = await artifactManager.uploadAllArtifacts(
        'test',
        'build-123',
        {
          logs: ['/tmp/worker.log'],
          testResults: { totalTests: 100 },
          coverage: { percentage: 85 },
          diff: 'diff content',
          metadata
        }
      );

      expect(results.length).toBe(5);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should upload only provided artifacts', async () => {
      const metadata: ArtifactMetadata = {
        buildId: 'build-123',
        environment: 'test',
        branchName: 'feature-test',
        timestamp: new Date(),
        success: true,
        duration: 120000
      };

      const results = await artifactManager.uploadAllArtifacts(
        'test',
        'build-123',
        {
          testResults: { totalTests: 100 },
          metadata
        }
      );

      expect(results.length).toBe(2); // test results + metadata
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('artifact key generation', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
    });

    it('should generate correct key for logs', async () => {
      const result = await artifactManager.uploadLog(
        'production',
        'build-456',
        'app.log',
        'content'
      );

      expect(result.key).toBe('production/build-456/logs/app.log');
    });

    it('should generate correct key for reports', async () => {
      const result = await artifactManager.uploadTestResults(
        'staging',
        'build-789',
        {}
      );

      expect(result.key).toBe('staging/build-789/reports/test-results.json');
    });

    it('should generate correct key for diffs', async () => {
      const result = await artifactManager.uploadDiff(
        'test',
        'build-111',
        'diff'
      );

      expect(result.key).toBe('test/build-111/diffs/changes.diff');
    });

    it('should generate correct key for metadata', async () => {
      const metadata: ArtifactMetadata = {
        buildId: 'build-222',
        environment: 'test',
        branchName: 'feature',
        timestamp: new Date(),
        success: true,
        duration: 1000
      };

      const result = await artifactManager.uploadMetadata(
        'test',
        'build-222',
        metadata
      );

      expect(result.key).toBe('test/build-222/metadata.json');
    });
  });

  describe('content type detection', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'test-bucket'
      });
      (fs.readFile as Mock).mockResolvedValue('content');
      mockSend.mockResolvedValue({}); // Ensure mockSend is properly set
    });

    it('should detect JSON content type', async () => {
      await artifactManager.uploadFile('test', 'build-123', 'reports', '/tmp/file.json');

      expect(mockSend).toHaveBeenCalled();
      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('application/json');
    });

    it('should detect text content type', async () => {
      await artifactManager.uploadFile('test', 'build-123', 'logs', '/tmp/file.txt');

      expect(mockSend).toHaveBeenCalled();
      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('text/plain');
    });

    it('should detect log content type', async () => {
      await artifactManager.uploadFile('test', 'build-123', 'logs', '/tmp/file.log');

      expect(mockSend).toHaveBeenCalled();
      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('text/plain');
    });

    it('should detect HTML content type', async () => {
      await artifactManager.uploadFile('test', 'build-123', 'reports', '/tmp/report.html');

      expect(mockSend).toHaveBeenCalled();
      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('text/html');
    });

    it('should use default content type for unknown extensions', async () => {
      await artifactManager.uploadFile('test', 'build-123', 'reports', '/tmp/file.xyz');

      expect(mockSend).toHaveBeenCalled();
      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.ContentType).toBe('application/octet-stream');
    });
  });

  describe('URL generation', () => {
    beforeEach(() => {
      artifactManager = new ArtifactManager({
        bucketName: 'my-artifacts',
        region: 'us-west-2'
      });
    });

    it('should generate correct S3 URL', async () => {
      const result = await artifactManager.uploadLog(
        'test',
        'build-123',
        'worker.log',
        'content'
      );

      expect(result.url).toBe('https://my-artifacts.s3.us-west-2.amazonaws.com/test/build-123/logs/worker.log');
    });
  });
});
