/**
 * Unit tests for Infrastructure Change Detector
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InfrastructureChangeDetector } from '../../lib/components/infrastructure-change-detector';
import * as simpleGit from 'simple-git';
import * as childProcess from 'child_process';

// Mock simple-git
vi.mock('simple-git');

// Mock child_process
vi.mock('child_process');

describe('InfrastructureChangeDetector', () => {
  let detector: InfrastructureChangeDetector;
  let mockGit: any;
  
  beforeEach(() => {
    // Create mock Git instance
    mockGit = {
      diff: vi.fn(),
    };
    
    // Mock simpleGit to return our mock instance
    vi.mocked(simpleGit.simpleGit).mockReturnValue(mockGit as any);
    
    // Create detector instance
    detector = new InfrastructureChangeDetector('/test/repo');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('getChangedFiles', () => {
    it('should correctly identify modified files', async () => {
      // Arrange
      const diffOutput = 'infrastructure/lib/stacks/test-stack.ts\nsrc/index.ts\nREADME.md';
      mockGit.diff.mockResolvedValue(diffOutput);
      
      // Act
      const files = await detector.getChangedFiles('HEAD~1', 'HEAD');
      
      // Assert
      expect(files).toEqual([
        'infrastructure/lib/stacks/test-stack.ts',
        'src/index.ts',
        'README.md',
      ]);
      expect(mockGit.diff).toHaveBeenCalledWith(['--name-only', 'HEAD~1', 'HEAD']);
    });
    
    it('should handle empty diff output', async () => {
      // Arrange
      mockGit.diff.mockResolvedValue('');
      
      // Act
      const files = await detector.getChangedFiles('HEAD~1', 'HEAD');
      
      // Assert
      expect(files).toEqual([]);
    });
    
    it('should throw error when Git operation fails', async () => {
      // Arrange
      mockGit.diff.mockRejectedValue(new Error('Git error'));
      
      // Act & Assert
      await expect(detector.getChangedFiles('HEAD~1', 'HEAD')).rejects.toThrow(
        /Failed to get changed files/
      );
    });
  });
  
  describe('hasMeaningfulChanges', () => {
    it('should return true when resources are added', () => {
      // Arrange
      const diffOutput = `
Stack KiroWorkerTest
Resources
[+] AWS::S3::Bucket MyBucket MyBucket123ABC
      `;
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return true when resources are deleted', () => {
      // Arrange
      const diffOutput = `
Stack KiroWorkerTest
Resources
[-] AWS::Lambda::Function MyFunction MyFunction123ABC
      `;
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return true when resources are modified', () => {
      // Arrange
      const diffOutput = `
Stack KiroWorkerTest
Resources
[~] AWS::DynamoDB::Table MyTable
 └─ [~] BillingMode
     ├─ [-] PAY_PER_REQUEST
     └─ [+] PROVISIONED
      `;
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return true when parameters change', () => {
      // Arrange
      const diffOutput = `
Stack KiroWorkerTest
Parameters
[+] EnvironmentParameter
      `;
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return true when outputs change', () => {
      // Arrange
      const diffOutput = `
Stack KiroWorkerTest
Outputs
[+] BucketNameOutput
      `;
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return false when diff is empty', () => {
      // Arrange
      const diffOutput = '';
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(false);
    });
    
    it('should return false when no differences message present', () => {
      // Arrange
      const diffOutput = 'There were no differences';
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(false);
    });
    
    it('should return false for metadata-only changes', () => {
      // Arrange
      const diffOutput = `
Stack KiroWorkerTest
Resources
[~] Tags
      `;
      
      // Act
      const result = detector.hasMeaningfulChanges(diffOutput);
      
      // Assert
      expect(result).toBe(false);
    });
  });
  
  describe('runCdkDiff', () => {
    it('should execute CDK diff and return output', async () => {
      // Arrange
      const mockStdout = 'Stack KiroWorkerTest\nResources\n[+] AWS::S3::Bucket';
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act
      const output = await detector.runCdkDiff();
      
      // Assert
      expect(output).toBe(mockStdout);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        'cdk',
        ['diff', '--all'],
        expect.objectContaining({
          cwd: '/test/repo/infrastructure',
          shell: true,
        })
      );
    });
    
    it('should handle CDK diff with changes (exit code 1)', async () => {
      // Arrange
      const mockStdout = 'Stack has changes';
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(1); // Exit code 1 means changes detected
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act
      const output = await detector.runCdkDiff();
      
      // Assert
      expect(output).toBe(mockStdout);
    });
    
    it('should throw error when CDK diff fails with error code', async () => {
      // Arrange
      const mockStderr = 'CDK error occurred';
      const mockProcess = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStderr));
            }
          }),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(2); // Exit code > 1 means error
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act & Assert
      await expect(detector.runCdkDiff()).rejects.toThrow(/CDK diff failed with code 2/);
    });
    
    it('should throw error when spawn fails', async () => {
      // Arrange
      const mockProcess = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Spawn error'));
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act & Assert
      await expect(detector.runCdkDiff()).rejects.toThrow(/Failed to execute CDK diff/);
    });
  });
  
  describe('detectChanges', () => {
    it('should return false when no infrastructure files changed', async () => {
      // Arrange
      mockGit.diff.mockResolvedValue('src/index.ts\nREADME.md\npackage.json');
      
      // Act
      const result = await detector.detectChanges('HEAD~1', 'HEAD');
      
      // Assert
      expect(result.deploymentNeeded).toBe(false);
      expect(result.changedFiles).toEqual([]);
      expect(result.reason).toBe('No infrastructure files changed');
    });
    
    it('should return true when infrastructure files changed with meaningful diff', async () => {
      // Arrange
      mockGit.diff.mockResolvedValue('infrastructure/lib/stacks/test-stack.ts\nsrc/index.ts');
      
      const mockStdout = `
Stack KiroWorkerTest
Resources
[+] AWS::S3::Bucket MyBucket
      `;
      
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(1);
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act
      const result = await detector.detectChanges('HEAD~1', 'HEAD');
      
      // Assert
      expect(result.deploymentNeeded).toBe(true);
      expect(result.changedFiles).toEqual(['infrastructure/lib/stacks/test-stack.ts']);
      expect(result.cdkDiff).toContain('AWS::S3::Bucket');
      expect(result.reason).toContain('Infrastructure changes detected');
    });
    
    it('should return false when infrastructure files changed but no meaningful diff', async () => {
      // Arrange
      mockGit.diff.mockResolvedValue('infrastructure/README.md');
      
      const mockStdout = 'There were no differences';
      
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act
      const result = await detector.detectChanges('HEAD~1', 'HEAD');
      
      // Assert
      expect(result.deploymentNeeded).toBe(false);
      expect(result.changedFiles).toEqual(['infrastructure/README.md']);
      expect(result.reason).toContain('no meaningful resource changes');
    });
    
    it('should detect buildspec file changes', async () => {
      // Arrange
      mockGit.diff.mockResolvedValue('buildspec-build.yml\nsrc/index.ts');
      
      const mockStdout = `
Stack KiroWorkerTest
Resources
[~] AWS::CodeBuild::Project BuildProject
      `;
      
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(1);
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act
      const result = await detector.detectChanges('HEAD~1', 'HEAD');
      
      // Assert
      expect(result.deploymentNeeded).toBe(true);
      expect(result.changedFiles).toEqual(['buildspec-build.yml']);
    });
    
    it('should detect cdk.json changes', async () => {
      // Arrange
      mockGit.diff.mockResolvedValue('cdk.json');
      
      const mockStdout = `
Stack KiroWorkerTest
Resources
[~] AWS::Lambda::Function
      `;
      
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(mockStdout));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(1);
          }
        }),
      };
      
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess as any);
      
      // Act
      const result = await detector.detectChanges('HEAD~1', 'HEAD');
      
      // Assert
      expect(result.deploymentNeeded).toBe(true);
      expect(result.changedFiles).toEqual(['cdk.json']);
    });
    
    it('should throw error when Git operation fails', async () => {
      // Arrange
      mockGit.diff.mockRejectedValue(new Error('Git error'));
      
      // Act & Assert
      await expect(detector.detectChanges('HEAD~1', 'HEAD')).rejects.toThrow(
        /Failed to detect infrastructure changes/
      );
    });
  });
});

