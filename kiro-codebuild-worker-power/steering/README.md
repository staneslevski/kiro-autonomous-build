# Steering Documentation

This directory contains centralized steering documentation for Kiro CodeBuild Worker projects.

## Files

The following steering files are provided by this power:

### Required Files

1. **git-workflow.md** - Git branching strategy, commit conventions, and pull request guidelines
2. **testing-standards.md** - Comprehensive testing requirements with 80% coverage minimum
3. **typescript-standards.md** - TypeScript coding conventions and best practices

### Recommended Files

4. **code-review.md** - Best practices for conducting thorough code reviews
5. **deployment-practices.md** - Infrastructure deployment and validation procedures

## Usage

These files are automatically synchronized to your project's `.kiro/steering/` directory when using the Kiro CodeBuild Worker system.

## Compliance

All code must comply with the standards defined in the required steering files. The testing standards are enforced automatically by the CI/CD pipeline.

## Updates

When steering files are updated:
1. Version is incremented in the power manifest
2. Workers automatically synchronize updated files during execution
3. Review changes and update code accordingly
4. Ensure compliance with new standards

## Note

The actual steering file content will be added in subsequent tasks (6.2). This README serves as a placeholder to establish the directory structure for task 6.1.
