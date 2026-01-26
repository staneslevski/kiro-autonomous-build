/**
 * CodeBuild Projects Stack for Kiro CodeBuild Worker
 * 
 * This stack creates CodeBuild projects for test, staging, and production environments.
 * Each project is configured with appropriate compute resources, timeout settings,
 * and environment-specific configurations.
 * 
 * Dependencies:
 * - CoreInfrastructureStack (artifacts bucket, log group, IAM role)
 */

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environments';

/**
 * Properties for CodeBuildProjectsStack
 */
export interface CodeBuildProjectsStackProps extends cdk.StackProps {
  /** Environment-specific configuration */
  config: EnvironmentConfig;
  
  /** S3 bucket for build artifacts from CoreInfrastructureStack */
  artifactsBucket: s3.IBucket;
  
  /** CloudWatch log group for CodeBuild from CoreInfrastructureStack */
  codeBuildLogGroup: logs.ILogGroup;
  
  /** IAM role for CodeBuild projects from CoreInfrastructureStack */
  codeBuildRole: iam.IRole;
}

/**
 * CodeBuild Projects Stack
 * 
 * Creates CodeBuild projects for executing Kiro Worker tasks.
 * Projects are configured with:
 * - Build compute type (SMALL by default)
 * - Timeout (60 minutes by default)
 * - buildspec.yml reference from repository
 * - Environment variables for configuration
 * - CloudWatch Logs integration
 * - S3 artifacts storage
 */
export class CodeBuildProjectsStack extends cdk.Stack {
  /** CodeBuild project for this environment */
  public readonly project: codebuild.Project;

  constructor(scope: Construct, id: string, props: CodeBuildProjectsStackProps) {
    super(scope, id, props);

    const { config, artifactsBucket, codeBuildLogGroup, codeBuildRole } = props;
    const environment = config.environment;

    // Create CodeBuild project
    this.project = this.createCodeBuildProject(
      environment,
      config,
      artifactsBucket,
      codeBuildLogGroup,
      codeBuildRole
    );

    // Add stack outputs
    this.createOutputs();
  }

  /**
   * Create CodeBuild project with environment-specific configuration
   */
  private createCodeBuildProject(
    environment: string,
    config: EnvironmentConfig,
    artifactsBucket: s3.IBucket,
    logGroup: logs.ILogGroup,
    role: iam.IRole
  ): codebuild.Project {
    const projectName = `kiro-worker-${environment}`;

    // Determine compute type from configuration
    const computeType = this.getComputeType(config.codeBuildComputeType || 'SMALL');

    // Determine timeout from configuration (default 60 minutes)
    const timeout = cdk.Duration.minutes(config.codeBuildTimeout || 60);

    // Create the CodeBuild project
    const project = new codebuild.Project(this, 'WorkerProject', {
      projectName,
      description: `Kiro Worker CodeBuild project for ${environment} environment`,

      // Use existing IAM role from CoreInfrastructureStack
      role,

      // Build environment configuration
      environment: {
        // Use Amazon Linux 2 with Node.js 18
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        
        // Compute type based on configuration
        computeType,
        
        // No privileged mode needed (not building Docker images)
        privileged: false,

        // Environment variables passed to build
        environmentVariables: {
          // Environment identifier (test, staging, production)
          ENVIRONMENT: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: environment,
          },
          
          // Coverage threshold for test validation
          COVERAGE_THRESHOLD: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: config.coverageThreshold.toString(),
          },
          
          // Branch name (passed from work item poller at runtime)
          BRANCH_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '', // Set by poller when triggering build
          },
          
          // Spec path (passed from work item poller at runtime)
          SPEC_PATH: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '', // Set by poller when triggering build
          },
          
          // Work item ID (passed from work item poller at runtime)
          WORK_ITEM_ID: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '', // Set by poller when triggering build
          },
        },
      },

      // Build specification from repository
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),

      // Timeout configuration
      timeout,
      
      // Queued timeout (how long build can wait in queue before timing out)
      queuedTimeout: cdk.Duration.hours(8),

      // Source configuration (will be set when triggering build)
      source: codebuild.Source.gitHub({
        owner: 'placeholder', // Will be overridden at build trigger time
        repo: 'placeholder',   // Will be overridden at build trigger time
        webhook: false,        // No webhook, triggered by Lambda
      }),

      // Artifacts configuration - upload to S3
      artifacts: codebuild.Artifacts.s3({
        bucket: artifactsBucket,
        includeBuildId: true,
        packageZip: false,
        path: `${environment}/`,
        name: 'artifacts',
      }),

      // CloudWatch Logs configuration
      logging: {
        cloudWatch: {
          logGroup,
          enabled: true,
        },
      },

      // Cache configuration for faster builds
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.SOURCE,
        codebuild.LocalCacheMode.CUSTOM
      ),

      // Badge configuration (optional)
      badge: false,

      // Concurrent build limit
      concurrentBuildLimit: 1, // Process one work item at a time
    });

    // Add tags
    cdk.Tags.of(project).add('Component', 'CodeBuild');
    cdk.Tags.of(project).add('Purpose', 'KiroWorker');

    return project;
  }

  /**
   * Convert compute type string to CodeBuild ComputeType enum
   */
  private getComputeType(type: 'SMALL' | 'MEDIUM' | 'LARGE'): codebuild.ComputeType {
    switch (type) {
      case 'SMALL':
        return codebuild.ComputeType.SMALL;   // 3 GB memory, 2 vCPUs
      case 'MEDIUM':
        return codebuild.ComputeType.MEDIUM;  // 7 GB memory, 4 vCPUs
      case 'LARGE':
        return codebuild.ComputeType.LARGE;   // 15 GB memory, 8 vCPUs
      default:
        return codebuild.ComputeType.SMALL;
    }
  }

  /**
   * Create CloudFormation outputs for cross-stack references
   */
  private createOutputs(): void {
    // Project name output
    new cdk.CfnOutput(this, 'ProjectName', {
      value: this.project.projectName,
      description: 'Name of the CodeBuild project',
      exportName: `${this.stackName}-ProjectName`,
    });

    // Project ARN output
    new cdk.CfnOutput(this, 'ProjectArn', {
      value: this.project.projectArn,
      description: 'ARN of the CodeBuild project',
      exportName: `${this.stackName}-ProjectArn`,
    });

    // Build role ARN output
    new cdk.CfnOutput(this, 'BuildRoleArn', {
      value: this.project.role?.roleArn || 'N/A',
      description: 'ARN of the IAM role used by CodeBuild',
      exportName: `${this.stackName}-BuildRoleArn`,
    });
  }
}
