/**
 * CD Pipeline Stack
 * 
 * This stack creates the AWS CodePipeline for continuous deployment with:
 * - GitHub source integration with webhook
 * - Build stage with testing and security scanning
 * - Test environment deployment and integration tests
 * - Staging environment deployment and E2E tests
 * - Production deployment with manual approval gate
 * 
 * The pipeline deploys APPLICATION CODE ONLY. Pipeline infrastructure
 * is deployed manually via CDK from developer laptop.
 */

import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { PipelineCodeBuildConstruct } from '../constructs/pipeline-codebuild-construct';

/**
 * Properties for CD Pipeline Stack
 */
export interface CDPipelineStackProps extends cdk.StackProps {
  /** Environment name (test, staging, production) */
  environment: 'test' | 'staging' | 'production';
  
  /** S3 bucket for pipeline artifacts */
  artifactsBucket: s3.IBucket;
  
  /** GitHub repository owner */
  githubOwner: string;
  
  /** GitHub repository name */
  githubRepo: string;
  
  /** GitHub branch to monitor */
  githubBranch?: string;
}

/**
 * CD Pipeline Stack
 * 
 * Creates AWS CodePipeline with 5 stages for continuous deployment:
 * 1. Source: GitHub webhook trigger
 * 2. Build: Compile, test, security scan
 * 3. Test Environment: Deploy application, integration tests
 * 4. Staging Environment: Deploy application, E2E tests
 * 5. Production Environment: Manual approval, deploy application
 */
export class CDPipelineStack extends cdk.Stack {
  /** The CodePipeline */
  public readonly pipeline: codepipeline.Pipeline;
  
  /** Build CodeBuild project */
  public readonly buildProject: PipelineCodeBuildConstruct;
  
  /** Integration test CodeBuild project */
  public readonly integrationTestProject: PipelineCodeBuildConstruct;
  
  /** E2E test CodeBuild project */
  public readonly e2eTestProject: PipelineCodeBuildConstruct;
  
  /** Test environment deployment project */
  public readonly testDeployProject: PipelineCodeBuildConstruct;
  
  /** Staging environment deployment project */
  public readonly stagingDeployProject: PipelineCodeBuildConstruct;
  
  /** Production environment deployment project */
  public readonly productionDeployProject: PipelineCodeBuildConstruct;
  
  /** SNS topic for approval notifications */
  public readonly approvalTopic: sns.Topic;
  
  constructor(scope: Construct, id: string, props: CDPipelineStackProps) {
    super(scope, id, props);
    
    const { environment, artifactsBucket, githubOwner, githubRepo, githubBranch = 'main' } = props;
    
    // Create SNS topic for approval notifications
    this.approvalTopic = this.createApprovalTopic(environment);
    
    // Create CodeBuild projects
    this.buildProject = this.createBuildProject(environment, artifactsBucket);
    this.integrationTestProject = this.createIntegrationTestProject(environment, artifactsBucket);
    this.e2eTestProject = this.createE2ETestProject(environment, artifactsBucket);
    this.testDeployProject = this.createDeploymentProject(environment, artifactsBucket, 'test');
    this.stagingDeployProject = this.createDeploymentProject(environment, artifactsBucket, 'staging');
    this.productionDeployProject = this.createDeploymentProject(environment, artifactsBucket, 'production');
    
    // Create pipeline
    this.pipeline = this.createPipeline(environment, artifactsBucket, githubOwner, githubRepo, githubBranch);
    
    // Export outputs
    this.exportOutputs(environment);
    
    // Add tags
    this.addTags(environment);
  }
  
  /**
   * Create SNS topic for approval notifications
   */
  private createApprovalTopic(environment: string): sns.Topic {
    const topic = new sns.Topic(this, 'ApprovalTopic', {
      topicName: `kiro-pipeline-${environment}-approvals`,
      displayName: `Kiro Pipeline ${environment} Approval Notifications`,
    });
    
    // Add email subscription (can be configured via parameter)
    // topic.addSubscription(new subscriptions.EmailSubscription('devops-team@example.com'));
    
    return topic;
  }
  
  /**
   * Create build CodeBuild project
   */
  private createBuildProject(
    environment: string,
    artifactsBucket: s3.IBucket
  ): PipelineCodeBuildConstruct {
    return new PipelineCodeBuildConstruct(this, 'BuildProject', {
      projectName: `kiro-pipeline-${environment}-build`,
      environment,
      buildSpecPath: 'buildspec-build.yml',
      artifactsBucket,
      environmentVariables: {
        ENVIRONMENT: { value: environment },
        COVERAGE_THRESHOLD: { value: '80' },
      },
    });
  }
  
  /**
   * Create integration test CodeBuild project
   */
  private createIntegrationTestProject(
    environment: string,
    artifactsBucket: s3.IBucket
  ): PipelineCodeBuildConstruct {
    return new PipelineCodeBuildConstruct(this, 'IntegrationTestProject', {
      projectName: `kiro-pipeline-${environment}-integration-test`,
      environment,
      buildSpecPath: 'buildspec-integration-test.yml',
      artifactsBucket,
      environmentVariables: {
        ENVIRONMENT: { value: 'test' },
        TEST_TYPE: { value: 'integration' },
      },
    });
  }
  
  /**
   * Create E2E test CodeBuild project
   */
  private createE2ETestProject(
    environment: string,
    artifactsBucket: s3.IBucket
  ): PipelineCodeBuildConstruct {
    return new PipelineCodeBuildConstruct(this, 'E2ETestProject', {
      projectName: `kiro-pipeline-${environment}-e2e-test`,
      environment,
      buildSpecPath: 'buildspec-e2e-test.yml',
      artifactsBucket,
      environmentVariables: {
        ENVIRONMENT: { value: 'staging' },
        TEST_TYPE: { value: 'e2e' },
      },
    });
  }
  
  /**
   * Create deployment CodeBuild project for specific environment
   */
  private createDeploymentProject(
    pipelineEnvironment: string,
    artifactsBucket: s3.IBucket,
    targetEnvironment: string
  ): PipelineCodeBuildConstruct {
    return new PipelineCodeBuildConstruct(this, `${targetEnvironment}DeployProject`, {
      projectName: `kiro-pipeline-${pipelineEnvironment}-deploy-${targetEnvironment}`,
      environment: pipelineEnvironment,
      buildSpecPath: 'buildspec-deploy.yml',
      artifactsBucket,
      environmentVariables: {
        ENVIRONMENT: { value: targetEnvironment },
        DEPLOYMENT_TYPE: { value: 'application' },
      },
    });
  }
  
  /**
   * Create the CodePipeline with all stages
   */
  private createPipeline(
    environment: string,
    artifactsBucket: s3.IBucket,
    githubOwner: string,
    githubRepo: string,
    githubBranch: string
  ): codepipeline.Pipeline {
    // Create pipeline role
    const pipelineRole = this.createPipelineRole(environment);
    
    // Create pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `kiro-pipeline-${environment}`,
      artifactBucket: artifactsBucket,
      role: pipelineRole,
      restartExecutionOnUpdate: false,
    });
    
    // Define artifacts
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');
    
    // Stage 1: Source
    const githubToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GitHubToken',
      `kiro-pipeline-${environment}-github-token`
    );
    
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub_Source',
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          oauthToken: githubToken.secretValue,
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
        }),
      ],
    });
    
    // Stage 2: Build
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_Test_SecurityScan',
          project: this.buildProject.project,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });
    
    // Stage 3: Test Environment
    pipeline.addStage({
      stageName: 'TestEnvironment',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy_To_Test',
          project: this.testDeployProject.project,
          input: buildOutput,
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Integration_Tests',
          project: this.integrationTestProject.project,
          input: buildOutput,
          runOrder: 2,
        }),
      ],
    });
    
    // Stage 4: Staging Environment
    pipeline.addStage({
      stageName: 'StagingEnvironment',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy_To_Staging',
          project: this.stagingDeployProject.project,
          input: buildOutput,
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'E2E_Tests',
          project: this.e2eTestProject.project,
          input: buildOutput,
          runOrder: 2,
        }),
      ],
    });
    
    // Stage 5: Production Environment
    pipeline.addStage({
      stageName: 'ProductionEnvironment',
      actions: [
        new codepipeline_actions.ManualApprovalAction({
          actionName: 'Approve_Production_Deployment',
          notificationTopic: this.approvalTopic,
          additionalInformation: 'Review test results and approve production deployment',
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy_To_Production',
          project: this.productionDeployProject.project,
          input: buildOutput,
          runOrder: 2,
        }),
      ],
    });
    
    return pipeline;
  }
  
  /**
   * Create IAM role for the pipeline with least privilege permissions
   */
  private createPipelineRole(environment: string): iam.Role {
    const role = new iam.Role(this, 'PipelineRole', {
      roleName: `kiro-pipeline-${environment}-role`,
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
      description: `IAM role for Kiro Pipeline ${environment}`,
    });
    
    // CodeBuild permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'codebuild:BatchGetBuilds',
        'codebuild:StartBuild',
      ],
      resources: [
        this.buildProject.project.projectArn,
        this.integrationTestProject.project.projectArn,
        this.e2eTestProject.project.projectArn,
        this.testDeployProject.project.projectArn,
        this.stagingDeployProject.project.projectArn,
        this.productionDeployProject.project.projectArn,
      ],
    }));
    
    // S3 permissions for artifacts
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:PutObject',
      ],
      resources: [
        `${this.buildProject.project.projectArn}/*`,
      ],
    }));
    
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetBucketAcl',
        's3:GetBucketLocation',
        's3:ListBucket',
      ],
      resources: [
        this.buildProject.project.projectArn,
      ],
    }));
    
    return role;
  }
  
  /**
   * Export stack outputs for cross-stack references
   */
  private exportOutputs(environment: string): void {
    new cdk.CfnOutput(this, 'PipelineArn', {
      value: this.pipeline.pipelineArn,
      description: 'ARN of the CodePipeline',
      exportName: `kiro-pipeline-${environment}-arn`,
    });
    
    new cdk.CfnOutput(this, 'PipelineName', {
      value: this.pipeline.pipelineName,
      description: 'Name of the CodePipeline',
      exportName: `kiro-pipeline-${environment}-name`,
    });
    
    new cdk.CfnOutput(this, 'ApprovalTopicArn', {
      value: this.approvalTopic.topicArn,
      description: 'ARN of the approval SNS topic',
      exportName: `kiro-pipeline-${environment}-approval-topic-arn`,
    });
  }
  
  /**
   * Add tags to all resources in the stack
   */
  private addTags(environment: string): void {
    cdk.Tags.of(this).add('Project', 'KiroPipeline');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Stack', 'CDPipeline');
  }
}
