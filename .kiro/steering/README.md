# Kiro CodeBuild Worker - Steering Documentation

## Overview

This directory contains steering documentation that guides development practices, coding standards, and workflows for the Kiro CodeBuild Worker project. All developers MUST read and follow these guidelines.

## Steering Files

### 1. Project Overview
**File**: `project-overview.md`

**Purpose**: High-level overview of the project including architecture, technology stack, development workflow, and key principles.

**Read this first** to understand the project structure and overall approach.

### 2. TypeScript Coding Standards
**File**: `typescript-standards.md`

**Purpose**: Comprehensive TypeScript coding standards including:
- TypeScript configuration requirements
- Code style and naming conventions
- Type annotations and best practices
- Async/await patterns
- Error handling
- AWS SDK v3 usage
- Documentation standards
- Security practices

**Key Points**:
- Enable strict TypeScript compiler options
- Use explicit types, avoid `any`
- Follow naming conventions (PascalCase, camelCase, UPPER_SNAKE_CASE)
- Use async/await consistently
- Implement proper error handling with custom error classes
- Use modular AWS SDK imports
- Document public APIs with JSDoc

### 3. Testing Standards and Requirements
**File**: `testing-standards.md`

**Purpose**: Mandatory testing requirements and best practices.

**CRITICAL REQUIREMENTS**:
- ⚠️ **ALL TESTS MUST PASS** - No exceptions
- ⚠️ **MINIMUM 80% CODE COVERAGE** - Enforced by Vitest
- ⚠️ **DO NOT SKIP TESTS** - Never use `.skip()` or similar
- ⚠️ **DO NOT IGNORE TESTS** - Never comment out failing tests
- ⚠️ **FIX FAILING TESTS** - Always fix code or test until passing
- ⚠️ **NO TASK IS COMPLETE** - Until all tests pass with ≥80% coverage

**Covers**:
- Vitest configuration and setup
- Test structure and organization
- Coverage requirements (80% minimum)
- Mocking and test doubles
- Async testing patterns
- Property-based testing with fast-check
- Integration testing
- CI/CD integration

### 4. AWS CDK Standards
**File**: `aws-cdk-standards.md`

**Purpose**: Standards for AWS CDK infrastructure code in TypeScript.

**Covers**:
- CDK project structure
- Stack design principles
- Resource naming conventions
- IAM permissions (least privilege)
- Resource configuration best practices
- Monitoring and alarms
- Testing CDK stacks
- Deployment best practices
- Security and cost optimization

**Key Points**:
- Single responsibility per stack
- Use constructs for reusable components
- Apply least privilege IAM permissions
- Enable encryption for all resources
- Write tests for infrastructure code
- Use environment-specific configuration

### 5. Git Workflow Standards
**File**: `git-workflow.md`

**Purpose**: Git branching strategy, commit conventions, and pull request guidelines.

**Covers**:
- Branch naming conventions (feature/, fix/, hotfix/)
- Conventional commits format
- Pull request templates and review process
- Merge strategies
- Protected branch rules
- Git hooks
- Best practices and troubleshooting

**Key Points**:
- Use feature branches for all work
- Follow conventional commits: `<type>(<scope>): <subject>`
- Create detailed pull requests
- Ensure all tests pass before merging
- Maintain ≥80% code coverage
- Keep main branch always deployable

## Quick Reference

### Before Starting Development

1. ✅ Read `project-overview.md` for project context
2. ✅ Read `typescript-standards.md` for coding guidelines
3. ✅ Read `testing-standards.md` for testing requirements
4. ✅ Read `git-workflow.md` for Git practices
5. ✅ Read `aws-cdk-standards.md` if working on infrastructure

### Before Committing Code

- [ ] Code follows TypeScript standards
- [ ] All tests pass: `npm test`
- [ ] Coverage ≥80%: `npm run test:coverage`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Commit message follows conventional commits format

### Before Creating Pull Request

- [ ] All tests pass in CI/CD
- [ ] Code coverage ≥80%
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] PR description filled out completely
- [ ] No console.log or debug code
- [ ] Error handling implemented
- [ ] Security considerations addressed

### Before Marking Task Complete

- [ ] All acceptance criteria met
- [ ] All tests pass (100% success rate)
- [ ] Code coverage ≥80% for all metrics
- [ ] No skipped or commented tests
- [ ] Integration tests added/updated
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] Merged to main branch

## Testing Requirements Summary

**These rules are ABSOLUTE and NON-NEGOTIABLE:**

```
┌─────────────────────────────────────────────────────────────┐
│                  CRITICAL TESTING RULES                      │
├─────────────────────────────────────────────────────────────┤
│  1. ALL TESTS MUST PASS                                     │
│  2. MINIMUM 80% CODE COVERAGE                               │
│  3. DO NOT SKIP TESTS                                       │
│  4. DO NOT IGNORE TESTS                                     │
│  5. DO NOT DISABLE TESTS                                    │
│  6. FIX FAILING TESTS                                       │
│  7. NO TASK IS COMPLETE UNTIL TESTS PASS WITH ≥80% COVERAGE│
└─────────────────────────────────────────────────────────────┘
```

If tests fail:
1. Investigate the root cause
2. Fix the implementation code OR fix the test
3. Re-run tests until they pass
4. Never mark a task as complete with failing tests

If coverage is below 80%:
1. Write additional tests for uncovered code paths
2. Test edge cases and error conditions
3. Achieve ≥80% coverage before completing the task

## Technology Stack Quick Reference

### Core Application
- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Testing**: Vitest + @vitest/coverage-v8
- **Property Testing**: fast-check
- **Git**: simple-git
- **GitHub API**: @octokit/rest
- **AWS SDK**: @aws-sdk/client-* (v3)

### Infrastructure
- **IaC**: AWS CDK (TypeScript)
- **Services**: CodeBuild, Lambda, DynamoDB, S3, Secrets Manager, EventBridge, CloudWatch, SNS

## Common Commands

```bash
# Development
npm install              # Install dependencies
npm test                 # Run tests
npm run test:coverage    # Run tests with coverage
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Run tests with UI
npm run lint             # Run linter
npm run build            # Build project

# Infrastructure
cd infrastructure
npm install              # Install CDK dependencies
cdk synth                # Synthesize CloudFormation
cdk deploy --all         # Deploy all stacks
cdk diff                 # Show changes
cdk destroy --all        # Destroy all stacks
```

## Getting Help

- **Documentation**: See `docs/` directory
- **Specifications**: See `.kiro/specs/` directory
- **Issues**: Create GitHub Issue
- **Questions**: Start GitHub Discussion

## Updates to Steering Documentation

When steering documentation is updated:
1. Version is incremented in Kiro Power manifest
2. Workers automatically synchronize updated files
3. Review changes and update code accordingly
4. Ensure compliance with new standards

## Compliance

All code merged to main branch MUST comply with these steering guidelines. Pull requests that do not meet these standards will be rejected.

**Remember**: These standards exist to ensure code quality, maintainability, and reliability. Following them makes the codebase better for everyone.
