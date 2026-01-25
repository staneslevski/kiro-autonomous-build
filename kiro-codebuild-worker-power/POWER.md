# Kiro CodeBuild Worker Power

## Overview

The Kiro CodeBuild Worker Power provides centralized steering documentation and coding standards for projects using the Kiro CodeBuild Worker system. This power ensures consistency across all projects by providing versioned, authoritative guidance on development practices, testing standards, and deployment procedures.

## Purpose

This power serves as the single source of truth for:

- **Git Workflow Standards**: Branch naming, commit conventions, pull request guidelines
- **Testing Standards**: Comprehensive testing requirements with 80% coverage minimum
- **Code Review Guidelines**: Best practices for reviewing code changes
- **Deployment Practices**: Infrastructure deployment and validation procedures
- **TypeScript Coding Standards**: Language-specific coding conventions and patterns

## Installation

### Via Kiro Powers Management Interface

1. Open Kiro IDE
2. Navigate to Powers management panel
3. Search for "Kiro CodeBuild Worker"
4. Click "Install" to add this power to your project

### Manual Installation

If you need to manually install the steering files:

```bash
# Clone or download the power
git clone https://github.com/kiro-platform/kiro-codebuild-worker-power.git

# Copy steering files to your project
cp -r kiro-codebuild-worker-power/steering/*.md .kiro/steering/

# Copy manifest for version tracking
cp kiro-codebuild-worker-power/manifest.json .kiro/steering/manifest.json
```

**Note**: Manual installation is not recommended. Use the Kiro Powers management interface or rely on automatic synchronization by the Kiro CodeBuild Worker.

## Usage

### Automatic Synchronization

When using the Kiro CodeBuild Worker system, steering files are automatically synchronized by the **Steering Synchronizer** component:

1. **On Worker Start**: The Steering Synchronizer checks if steering files are up-to-date
2. **Version Comparison**: Compares local manifest (`/.kiro/steering/manifest.json`) with power manifest
3. **Checksum Verification**: Uses SHA-256 checksums to detect file changes
4. **File Synchronization**: Downloads missing or outdated files from the power
5. **Commit Updates**: Commits synchronized files to the feature branch with a descriptive message

**Synchronization Process**:
```
1. Worker starts execution
2. SteeringSynchronizer.checkSteeringVersion()
   - Reads local manifest (if exists)
   - Fetches power manifest
   - Compares versions and checksums
3. If updates needed:
   - SteeringSynchronizer.synchronizeSteeringFiles()
   - Downloads updated files
   - Writes to .kiro/steering/
4. SteeringSynchronizer.commitSteeringUpdates()
   - Commits changes with message: "chore: synchronize steering files to v{version}"
   - Logs which files were updated
```

**Logging**: The worker logs all synchronization activities including:
- Current local version vs. power version
- List of files added, updated, or unchanged
- Commit hash of steering updates

### Manual Synchronization

To manually check for updates or trigger synchronization:

```bash
# Check current version
cat .kiro/steering/manifest.json

# The Kiro CodeBuild Worker automatically synchronizes steering files
# when it detects version mismatches. To force synchronization,
# delete the local manifest and let the worker re-sync:
rm .kiro/steering/manifest.json

# Or manually download the latest version from the power repository
# and copy the files to .kiro/steering/
```

**Note**: The Kiro CodeBuild Worker's Steering Synchronizer component automatically handles version checking and file synchronization. Manual intervention is rarely needed.

## Steering Files

This power includes the following steering documentation files:

### Overview (`steering/README.md`)

Quick reference guide to all steering files with usage instructions and compliance requirements.

**Required**: Yes (informational)

### Git Workflow Standards (`steering/git-workflow.md`)

Defines the Git branching strategy, commit message conventions, and pull request process:

- Branch naming conventions (feature/, fix/, hotfix/)
- Conventional commits format
- Pull request templates and review checklist
- Merge strategies and protected branch rules

**Required**: Yes

### Testing Standards (`steering/testing-standards.md`)

Comprehensive testing requirements and best practices:

- Vitest configuration and setup
- 80% minimum code coverage requirement (enforced)
- Unit testing, integration testing, property-based testing
- Test structure and organization

**Required**: Yes

**Critical Rules**:
- ALL TESTS MUST PASS - No exceptions
- MINIMUM 80% CODE COVERAGE - Enforced by Vitest
- DO NOT SKIP TESTS - Never use `.skip()` or similar
- FIX FAILING TESTS - Always fix code or test until passing

### Code Review Guidelines (`steering/code-review.md`)

Best practices for conducting thorough code reviews:

- Review checklist and focus areas
- Security considerations
- Performance considerations
- Code quality standards

**Required**: No (recommended)

### Deployment Practices (`steering/deployment-practices.md`)

Infrastructure deployment and validation procedures:

- AWS CDK deployment guidelines
- Pre-deployment validation
- Post-deployment verification
- Rollback procedures

**Required**: No (recommended)

### TypeScript Coding Standards (`steering/typescript-standards.md`)

Language-specific coding conventions:

- TypeScript configuration requirements
- Naming conventions and code style
- Type annotations and best practices
- Error handling patterns
- AWS SDK v3 usage guidelines

**Required**: Yes

## Version Management

This power uses semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes to steering file structure or requirements
- **MINOR**: New steering files added or significant content additions
- **PATCH**: Content updates, clarifications, or minor corrections

### Current Version

**Version**: 1.0.0

### Manifest Structure

The power includes a `manifest.json` file that tracks version and file integrity:

```json
{
  "name": "kiro-codebuild-worker-steering",
  "version": "1.0.0",
  "steeringFiles": [
    {
      "path": "steering/git-workflow.md",
      "checksum": "sha256:...",
      "required": true,
      "description": "Git branching strategy, commit conventions, and pull request guidelines"
    }
  ]
}
```

**Checksum Verification**: Each steering file has a SHA-256 checksum that ensures file integrity and detects changes. The Steering Synchronizer uses these checksums to determine which files need updating.

### Version History

- **1.0.0** (2026-01-25): Initial release with core steering files
  - Git workflow standards
  - Testing standards with 80% coverage requirement
  - Code review guidelines
  - Deployment practices
  - TypeScript coding standards

## Update Notifications

When a new version of this power is released:

1. **Version Mismatch Detection**: Workers detect version mismatches during startup
2. **Automatic Synchronization**: Workers automatically download and apply updates
3. **Logging**: Workers log version changes and updated files
4. **Commit to Branch**: Updates are committed to the feature branch for review

**Breaking Changes**: When a MAJOR version update occurs (e.g., 1.x.x → 2.0.0):
- Workers log a warning about breaking changes
- Updates are still applied automatically
- Review the changelog and update your code accordingly
- Test thoroughly before merging

**Update Frequency**: Check for updates:
- On every worker execution (automatic)
- When manually triggered via worker restart
- When manifest.json is deleted (forces re-sync)

## Troubleshooting

### Steering Files Not Synchronizing

**Problem**: Steering files are outdated or missing after worker execution.

**Solutions**:
1. Check worker logs for synchronization errors
2. Verify network connectivity to power repository
3. Delete local manifest to force re-sync: `rm .kiro/steering/manifest.json`
4. Check file permissions in `.kiro/steering/` directory

### Version Mismatch Warnings

**Problem**: Worker logs show version mismatches but files aren't updating.

**Solutions**:
1. Verify the power manifest is accessible
2. Check for file system permissions issues
3. Review worker logs for specific error messages
4. Manually download and copy steering files as a workaround

### Checksum Verification Failures

**Problem**: Worker reports checksum mismatches for steering files.

**Solutions**:
1. Local files may have been manually modified
2. Delete modified files and let worker re-sync
3. Compare local files with power repository to identify changes
4. If intentional modifications, consider creating custom steering files

### Merge Conflicts with Steering Updates

**Problem**: Steering file updates cause merge conflicts.

**Solutions**:
1. Accept incoming changes from the power (recommended)
2. Review conflicts carefully - steering files should not be modified locally
3. If custom modifications are needed, create separate custom steering files
4. Resolve conflicts and commit

## Compliance

All code using the Kiro CodeBuild Worker system MUST comply with the steering guidelines provided by this power. Pull requests that do not meet these standards will be rejected by automated checks.

### Enforcement

- **Testing Standards**: Enforced by Vitest configuration (80% coverage threshold)
- **Git Workflow**: Enforced by protected branch rules and CI/CD checks
- **Code Quality**: Enforced by linting and type checking in CI/CD pipeline

## Customization

While this power provides baseline standards, projects may extend or customize:

1. **Additional Steering Files**: Add project-specific guidelines in `.kiro/steering/custom/`
2. **Stricter Requirements**: Increase coverage thresholds or add additional checks
3. **Language-Specific Standards**: Add standards for other languages (Python, Java, etc.)

**Note**: Customizations should not relax the baseline requirements defined in this power.

**Custom Steering Files**: If you need project-specific guidance:
```bash
# Create custom steering directory
mkdir -p .kiro/steering/custom

# Add custom files
echo "# Project-Specific Guidelines" > .kiro/steering/custom/project-standards.md
```

Custom files are not managed by the Steering Synchronizer and won't be overwritten during updates.

## Integration with Kiro CodeBuild Worker

This power is designed to work seamlessly with the Kiro CodeBuild Worker system:

### Worker Components

**Steering Synchronizer** (`src/components/steering-synchronizer.ts`):
- Checks steering file versions on worker startup
- Downloads and synchronizes files from this power
- Commits updates to the feature branch
- Logs all synchronization activities

**Worker Execution Flow**:
```
1. Worker starts (triggered by GitHub Project work item)
2. Git Branch Manager checks out feature branch
3. Steering Synchronizer ensures steering files are current ← This Power
4. Kiro CLI Executor runs spec tasks (using steering guidance)
5. Test Runner validates code (enforces testing standards)
6. Pull Request Updater posts results
```

### Environment Variables

The worker uses these environment variables for steering synchronization:

- `POWER_REPOSITORY_URL`: URL to this power's repository (default: GitHub)
- `STEERING_SYNC_ENABLED`: Enable/disable automatic sync (default: true)
- `STEERING_VERSION_CHECK`: Enable/disable version checking (default: true)

### Configuration

Configure steering synchronization in worker configuration:

```typescript
// src/types/config.ts
interface WorkerConfig {
  steeringSyncEnabled: boolean;
  powerRepositoryUrl: string;
  steeringPath: string; // Default: .kiro/steering
}
```

## Support

### Documentation

- Full documentation available in each steering file
- Examples and best practices included
- Troubleshooting guidance provided

### Issues and Feedback

- Report issues with steering documentation
- Suggest improvements or additions
- Request clarifications on guidelines

### Contributing

Contributions to improve steering documentation are welcome:

1. Fork the power repository
2. Make improvements to steering files
3. Submit pull request with clear description
4. Ensure all examples are tested and accurate

## License

This power is provided under the same license as the Kiro CodeBuild Worker project.

## Related Resources

- [Kiro CLI Documentation](https://docs.kiro.dev)
- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)

## Acknowledgments

This power builds upon industry best practices and community standards for software development, testing, and deployment.
