/**
 * Reusable CodeBuild project construct for CD pipeline stages
 * 
 * This construct creates a standardized CodeBuild project configured for
 * the Kiro Worker CD pipeline with proper caching, logging, and IAM permissions.
 */

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Properties for PipelineCodeBuildConstruct
 */
export interface PipelineCodeBuildConstructProps {
  /**
   * Name of the CodeBuild project
   */
  readonly projectName: string;

  /**
   * Environment (test, staging, production)
   */
  readonly environment: string;

  /**
   * Path to the buildspec file
   */
  readonly buildSpecPath: string;

  /**
   * S3 bucket for storing artifacts
   */
  readonly artifactsBucket: s3.IBucket;

  /**
   * Environment variables for the build
   */
  readonly environmentVariables?: { [key: string]: codebuild.BuildEnvironmentVariable };

  /**
   * IAM role for the CodeBuild project
   * If not provided, a new role will be created with required permissions
   */
  readonly role?: iam.IRole;

  /**
   * CloudWatch log group for build logs
   * If not provided, a new log group will be created
   */
  readonly logGroup?: logs.ILogGroup;
}

/**
 * Reusable CodeBuild project construct for CD pipeline stages
 * 
 * Creates a CodeBuild project with:
 * - Standard build environment (Linux, Node.js 18)
 * - Multi-layer caching (source, Docker, custom)
 * - CloudWatch logging
 * - Least privilege IAM permissions
 * - Appropriate timeouts for CI/CD workloads
 */
export class PipelineCodeBuildConstruct extends Construct {
  /**
   * The CodeBuild project
   */
  public readonly project: codebuild.Project;

  /**
   * The IAM role used by the CodeBuild project
   */
  public readonly role: iam.IRole;

  /**
   * The CloudWatch log group for build logs
   */
  public readonly logGroup: logs.ILogGroup;

  constructor(scope: Construct, id: string, props: PipelineCodeBuildConstructProps) {
    super(scope, id);

    // Create CloudWatch log group if not provided
    this.logGroup = props.logGroup ?? new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/codebuild/${props.projectName}`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Create IAM role if not provided
    this.role = props.role ?? this.createRole(props);

    // Create CodeBuild project
    this.project = new codebuild.Project(this, 'Project', {
      projectName: props.projectName,
      description: `CodeBuild project for ${props.environment} environment - ${props.projectName}`,
      
      // Source configuration - GitHub placeholder for pipeline integration
      // When used in CodePipeline, the pipeline will override this source
      source: codebuild.Source.gitHub({
        owner: 'placeholder',
        repo: 'placeholder',
        webhook: false
      }),
      
      // Build environment configuration
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
        environmentVariables: props.environmentVariables
      },

      // Build specification
      buildSpec: codebuild.BuildSpec.fromSourceFilename(props.buildSpecPath),

      // Caching configuration for faster builds
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.SOURCE,
        codebuild.LocalCacheMode.DOCKER_LAYER,
        codebuild.LocalCacheMode.CUSTOM
      ),

      // Timeout settings
      timeout: cdk.Duration.minutes(60),
      queuedTimeout: cdk.Duration.hours(8),

      // Logging configuration
      logging: {
        cloudWatch: {
          logGroup: this.logGroup,
          enabled: true
        }
      },

      // IAM role
      role: this.role
    });

    // Grant read/write access to artifacts bucket
    props.artifactsBucket.grantReadWrite(this.role);

    // Output project ARN and name
    new cdk.CfnOutput(this, 'ProjectArn', {
      value: this.project.projectArn,
      description: `ARN of CodeBuild project ${props.projectName}`,
      exportName: `${props.projectName}-Arn`
    });

    new cdk.CfnOutput(this, 'ProjectName', {
      value: this.project.projectName,
      description: `Name of CodeBuild project ${props.projectName}`,
      exportName: `${props.projectName}-Name`
    });
  }

  /**
   * Creates an IAM role with least privilege permissions for the CodeBuild project
   * 
   * @param props - Construct properties
   * @returns IAM role with required permissions
   */
  private createRole(props: PipelineCodeBuildConstructProps): iam.IRole {
    const role = new iam.Role(this, 'Role', {
      roleName: `${props.projectName}-role`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: `IAM role for CodeBuild project ${props.projectName}`
    });

    // CloudWatch Logs permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/codebuild/${props.projectName}`,
        `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/codebuild/${props.projectName}:*`
      ]
    }));

    // S3 permissions for artifacts (specific to artifacts bucket)
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:PutObject'
      ],
      resources: [
        `${props.artifactsBucket.bucketArn}/*`
      ]
    }));

    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetBucketAcl',
        's3:GetBucketLocation',
        's3:ListBucket'
      ],
      resources: [
        props.artifactsBucket.bucketArn
      ]
    }));

    // Secrets Manager permissions (for accessing GitHub tokens and other secrets)
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue'
      ],
      resources: [
        `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:kiro-pipeline-${props.environment}-*`
      ]
    }));

    // STS AssumeRole permissions for CDK deployments
    // This allows the CodeBuild project to assume roles needed for CDK deploy
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole'
      ],
      resources: [
        `arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-*`
      ]
    }));

    return role;
  }
}
