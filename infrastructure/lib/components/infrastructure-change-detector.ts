/**
 * Infrastructure Change Detector
 * 
 * Detects infrastructure changes by analyzing:
 * - Git file changes in infrastructure directories
 * - CDK diff output for meaningful resource changes
 * 
 * This helps determine if CDK deployment is needed or if only
 * application code has changed.
 */

import { simpleGit, SimpleGit, DiffResult } from 'simple-git';
import { spawn } from 'child_process';

/**
 * Result of infrastructure change detection
 */
export interface ChangeDetectionResult {
  /** Whether CDK deployment is needed */
  deploymentNeeded: boolean;
  
  /** List of changed infrastructure files */
  changedFiles: string[];
  
  /** CDK diff output (if deployment needed) */
  cdkDiff?: string;
  
  /** Reason for the decision */
  reason: string;
}

/**
 * Infrastructure Change Detector
 * 
 * Analyzes Git changes and CDK diff to determine if infrastructure
 * deployment is needed. Filters for infrastructure-related files and
 * ignores metadata-only changes.
 */
export class InfrastructureChangeDetector {
  private readonly git: SimpleGit;
  private readonly repoPath: string;
  
  /**
   * Patterns for infrastructure files that trigger CDK deployment
   */
  private readonly infrastructurePatterns = [
    /^infrastructure\//,
    /^buildspec.*\.yml$/,
    /^cdk\.json$/,
  ];
  
  /**
   * Create a new Infrastructure Change Detector
   * 
   * @param repoPath - Path to the Git repository (defaults to current directory)
   */
  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }
  
  /**
   * Detect infrastructure changes between two commits
   * 
   * Checks both file changes and CDK diff to determine if deployment is needed.
   * Returns false if only application code changed, true if infrastructure changed.
   * 
   * @param fromCommit - Starting commit (e.g., 'HEAD~1', commit SHA)
   * @param toCommit - Ending commit (defaults to 'HEAD')
   * @returns Promise that resolves to change detection result
   * @throws Error if Git or CDK operations fail
   */
  async detectChanges(
    fromCommit: string = 'HEAD~1',
    toCommit: string = 'HEAD'
  ): Promise<ChangeDetectionResult> {
    try {
      // Step 1: Get changed files from Git
      const changedFiles = await this.getChangedFiles(fromCommit, toCommit);
      
      // Step 2: Filter for infrastructure files
      const infrastructureFiles = changedFiles.filter(file =>
        this.isInfrastructureFile(file)
      );
      
      // If no infrastructure files changed, no deployment needed
      if (infrastructureFiles.length === 0) {
        return {
          deploymentNeeded: false,
          changedFiles: [],
          reason: 'No infrastructure files changed',
        };
      }
      
      // Step 3: Run CDK diff to check for meaningful changes
      const cdkDiff = await this.runCdkDiff();
      
      // Step 4: Analyze diff for meaningful changes
      const hasMeaningful = this.hasMeaningfulChanges(cdkDiff);
      
      if (!hasMeaningful) {
        return {
          deploymentNeeded: false,
          changedFiles: infrastructureFiles,
          cdkDiff,
          reason: 'Infrastructure files changed but no meaningful resource changes detected',
        };
      }
      
      return {
        deploymentNeeded: true,
        changedFiles: infrastructureFiles,
        cdkDiff,
        reason: `Infrastructure changes detected in ${infrastructureFiles.length} file(s)`,
      };
    } catch (error) {
      throw new Error(
        `Failed to detect infrastructure changes: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Get list of changed files between two commits
   * 
   * Uses git diff to identify modified, added, or deleted files.
   * 
   * @param fromCommit - Starting commit
   * @param toCommit - Ending commit
   * @returns Promise that resolves to array of file paths
   * @throws Error if Git operation fails
   */
  async getChangedFiles(fromCommit: string, toCommit: string): Promise<string[]> {
    try {
      const diff: DiffResult = await this.git.diff([
        '--name-only',
        fromCommit,
        toCommit,
      ]);
      
      // Parse diff output into array of file paths
      const files = diff
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      return files;
    } catch (error) {
      throw new Error(
        `Failed to get changed files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Run CDK diff and capture output
   * 
   * Executes 'cdk diff --all' in the infrastructure directory and
   * captures the output for analysis.
   * 
   * @returns Promise that resolves to CDK diff output
   * @throws Error if CDK diff fails
   */
  async runCdkDiff(): Promise<string> {
    return new Promise((resolve, reject) => {
      const cdkProcess = spawn('cdk', ['diff', '--all'], {
        cwd: `${this.repoPath}/infrastructure`,
        shell: true,
      });
      
      let stdout = '';
      let stderr = '';
      
      cdkProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      cdkProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      cdkProcess.on('close', (code) => {
        // CDK diff returns 0 for no changes, 1 for changes, >1 for errors
        if (code !== null && code > 1) {
          reject(new Error(`CDK diff failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
      
      cdkProcess.on('error', (error) => {
        reject(new Error(`Failed to execute CDK diff: ${error.message}`));
      });
    });
  }
  
  /**
   * Check if CDK diff contains meaningful changes
   * 
   * Parses CDK diff output to determine if there are actual resource changes.
   * Ignores metadata-only changes like tags or descriptions.
   * 
   * @param diffOutput - CDK diff output to analyze
   * @returns True if meaningful changes detected, false otherwise
   */
  hasMeaningfulChanges(diffOutput: string): boolean {
    // If diff is empty or only whitespace, no changes
    if (!diffOutput || diffOutput.trim().length === 0) {
      return false;
    }
    
    // Check for "There were no differences" message
    if (diffOutput.includes('There were no differences')) {
      return false;
    }
    
    // Look for actual resource changes (add, delete, modify AWS resources)
    const resourceChangePatterns = [
      /\[\+\]\s+AWS::/,                // New resources
      /\[-\]\s+AWS::/,                // Deleted resources
      /\[~\]\s+AWS::/,                // Modified resources
    ];
    
    // Check if any resource change pattern matches
    const hasResourceChange = resourceChangePatterns.some(pattern =>
      pattern.test(diffOutput)
    );
    
    // If there are resource changes, it's meaningful
    if (hasResourceChange) {
      return true;
    }
    
    // Look for parameter or output changes
    const structuralChangePatterns = [
      /Parameters\s*\n\s*\[[\+\-~]/,  // Parameter changes
      /Outputs\s*\n\s*\[[\+\-~]/,     // Output changes
    ];
    
    // Check if any structural change pattern matches
    const hasStructuralChange = structuralChangePatterns.some(pattern =>
      pattern.test(diffOutput)
    );
    
    // If there are structural changes, it's meaningful
    if (hasStructuralChange) {
      return true;
    }
    
    // Check if changes are metadata-only (tags, descriptions)
    const metadataOnlyPatterns = [
      /\[~\]\s+Tags\s*$/m,
      /\[~\]\s+Description\s*$/m,
    ];
    
    // If only metadata changes found, not meaningful
    const hasMetadataChange = metadataOnlyPatterns.some(pattern =>
      pattern.test(diffOutput)
    );
    
    // If we have metadata changes but no resource/structural changes, not meaningful
    if (hasMetadataChange && !hasResourceChange && !hasStructuralChange) {
      return false;
    }
    
    // Check for Resources section with changes indicator
    if (/Resources\s*\n\s*\[[\+\-~]/.test(diffOutput)) {
      return true;
    }
    
    // No meaningful changes detected
    return false;
  }
  
  /**
   * Check if a file path matches infrastructure patterns
   * 
   * @param filePath - File path to check
   * @returns True if file is infrastructure-related, false otherwise
   */
  private isInfrastructureFile(filePath: string): boolean {
    return this.infrastructurePatterns.some(pattern => pattern.test(filePath));
  }
}

