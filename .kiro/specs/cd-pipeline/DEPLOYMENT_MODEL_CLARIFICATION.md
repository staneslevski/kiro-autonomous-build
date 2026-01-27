# CD Pipeline Deployment Model Clarification

## Summary of Changes

The requirements document has been updated to explicitly clarify the **two-stage deployment model** for the CD pipeline feature.

## What Changed

### Before (Unclear Model)
The original requirements described a single deployment that handled both infrastructure and application code together, leaving ambiguity about:
- Who deploys what
- When infrastructure vs application deployments occur
- Whether the pipeline can update itself

### After (Clear Two-Stage Model)

#### Stage 1: Pipeline Infrastructure Deployment
- **Deployed by**: DevOps engineer from their laptop
- **Tool**: AWS CDK CLI (`cdk deploy`)
- **Frequency**: Infrequent (initial setup + infrastructure updates)
- **What**: CodePipeline, CodeBuild, monitoring, rollback systems, IAM roles, etc.
- **Target**: AWS account/region

#### Stage 2: Application Deployment
- **Deployed by**: The CodePipeline (automated)
- **Tool**: CodeBuild projects within the pipeline
- **Frequency**: Continuous (every commit to main)
- **What**: Kiro CodeBuild Worker application code
- **Target**: Test → Staging → Production environments

## Key Clarifications Added

### Section 1: Feature Overview
- Added **CRITICAL DEPLOYMENT MODEL** section explaining the two-stage architecture
- Clarified scope: pipeline infrastructure vs application deployment
- Added "Self-updating pipeline" to out-of-scope items

### Section 2: User Stories
- **US-1**: New story for "Pipeline Infrastructure Deployment" (manual, from laptop)
- **US-2**: Renamed to "Automated Application Deployment" (automatic, via pipeline)
- **US-4**: Removed cfn-guard/cfn-lint from application security scanning (these are for infrastructure)
- **US-8**: Renamed to "Pipeline Infrastructure Change Detection" (for manual updates)

### Section 3: New Deployment Workflow Section
- Detailed explanation of Stage 1 vs Stage 2
- When each deployment occurs
- How each deployment is triggered
- What gets deployed in each stage
- Rationale for separation

### Section 4: Technical Requirements
- **TR-1**: Clarified that CDK is for pipeline infrastructure (from laptop)
- **TR-1**: Added "Application deployments do not modify pipeline infrastructure"
- **TR-4**: Separated infrastructure security (CDK deployment) from application security (pipeline execution)
- **TR-8**: Separated pipeline infrastructure deployment time from application deployment time

### Section 6: Dependencies and Assumptions
- Added dependencies on developer laptop tools (CDK, AWS CLI, Node.js)
- Added assumption that pipeline infrastructure changes are infrequent
- Added assumption that pipeline does not need to update itself automatically

### Section 8: Risks and Mitigations
- Added risk: "Pipeline infrastructure deployment fails"
- Added risk: "Pipeline infrastructure and application version mismatch"

### Section 10: Acceptance Criteria
- Added criteria for pipeline infrastructure deployment from laptop
- Added criteria for separation between infrastructure and application deployments
- Added criteria for independent infrastructure updates

## Why This Matters

### Architectural Clarity
- Clear separation of concerns between infrastructure and application
- Prevents confusion about deployment responsibilities
- Establishes clear boundaries for automation

### Operational Safety
- Pipeline cannot accidentally break itself during application deployments
- Infrastructure changes require deliberate action by DevOps engineers
- Reduces risk of cascading failures

### Development Workflow
- Developers focus on application code (automatically deployed)
- DevOps engineers manage pipeline infrastructure (manually deployed)
- Clear handoff points and responsibilities

## Implementation Impact

### What Needs to Be Built

#### Pipeline Infrastructure (CDK Stacks)
- Deployed via `cdk deploy` from laptop
- Creates CodePipeline, CodeBuild, monitoring, etc.
- Infrequent updates

#### Application Deployment Logic (CodeBuild Projects)
- Runs within the pipeline
- Deploys application code to environments
- Triggered automatically by commits

### What Does NOT Need to Be Built
- Self-updating pipeline mechanism
- Infrastructure deployment within the pipeline
- CDK execution within CodeBuild (for pipeline infrastructure)

## Next Steps

1. Review updated requirements document
2. Update design document to reflect two-stage model
3. Plan CDK stack structure for pipeline infrastructure
4. Plan CodeBuild project configuration for application deployment
5. Define clear interfaces between the two stages

## Questions to Consider

1. How do we version-match pipeline infrastructure with application code?
2. What happens if pipeline infrastructure is outdated when application deploys?
3. Should we add health checks for pipeline infrastructure?
4. How do we test pipeline infrastructure changes before deploying?
5. Should pipeline infrastructure updates require approval gates?

## Conclusion

The requirements document now explicitly describes a **two-stage deployment model** where:
1. Pipeline infrastructure is deployed manually from a laptop using CDK
2. Application code is deployed automatically by the pipeline

This clarification eliminates ambiguity and provides a clear foundation for design and implementation.
