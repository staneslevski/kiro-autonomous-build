# Git Workflow Standards

## Overview

This document defines Git workflow standards for the Kiro CodeBuild Worker project, including branching strategy, commit conventions, and pull request guidelines.

## Branch Strategy

### Main Branches

**main** - Production-ready code
- Always deployable
- Protected branch (requires PR and reviews)
- All tests must pass before merge
- Minimum 80% code coverage required

**develop** - Integration branch (optional)
- Latest development changes
- Feature branches merge here first
- Staging deployments from this branch

### Feature Branches

**Naming Convention**:
```
feature/{issue-number}-{short-description}
feature/123-add-git-branch-manager
feature/456-implement-test-runner
```

**Rules**:
- Create from `main` (or `develop` if using)
- One feature per branch
- Keep branches short-lived (< 1 week)
- Delete after merge

### Bug Fix Branches

**Naming Convention**:
```
fix/{issue-number}-{short-description}
fix/789-handle-git-timeout
fix/101-coverage-calculation-error
```

### Hotfix Branches

**Naming Convention**:
```
hotfix/{version}-{short-description}
hotfix/1.2.1-critical-security-patch
```

**Rules**:
- Create from `main`
- Merge to both `main` and `develop`
- Deploy immediately after merge

## Commit Messages

### Conventional Commits Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no logic change)
- **refactor**: Code refactoring (no feature or bug fix)
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build config)
- **perf**: Performance improvements
- **ci**: CI/CD changes

### Examples

```
feat(git-manager): add branch validation logic

Implement validation to check that spec files exist in the
.kiro/specs/{branch-name}/ directory before proceeding with
code generation.

Closes #123
```

```
fix(test-runner): correct coverage calculation for edge cases

The coverage calculator was returning incorrect percentages
when total lines was zero. Added guard clause to handle this
edge case.

Fixes #456
```

```
test(pull-request-updater): add integration tests for GitHub API

Added comprehensive integration tests for PR update functionality
including error handling and retry logic.

Coverage increased from 75% to 92%.
```

### Commit Message Rules

1. Use imperative mood ("add" not "added" or "adds")
2. Don't capitalize first letter of subject
3. No period at end of subject
4. Limit subject line to 50 characters
5. Wrap body at 72 characters
6. Separate subject from body with blank line
7. Use body to explain what and why, not how
8. Reference issues in footer

## Pull Request Guidelines

### PR Title Format

```
[Type] Brief description of changes

Examples:
[Feature] Add Git branch validation
[Fix] Handle timeout in retry logic
[Refactor] Simplify error handling in test runner
```

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Changes
- List of specific changes made
- Another change
- Yet another change

## Testing
- [ ] All tests pass
- [ ] Code coverage ≥ 80%
- [ ] Manual testing completed
- [ ] Integration tests added/updated

## Related Issues
Closes #123
Related to #456

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows TypeScript standards
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log or debug code
- [ ] Error handling implemented
- [ ] Security considerations addressed
```

### PR Review Process

**Before Creating PR**:
1. Run all tests locally: `npm test`
2. Check coverage: `npm run test:coverage`
3. Run linter: `npm run lint`
4. Build successfully: `npm run build`
5. Self-review your changes

**PR Requirements**:
- All tests must pass (CI/CD)
- Code coverage ≥ 80%
- At least 1 approval from team member
- No merge conflicts
- All review comments addressed

**Review Checklist**:
- [ ] Code is clear and maintainable
- [ ] Tests are comprehensive
- [ ] Error handling is appropriate
- [ ] No security vulnerabilities
- [ ] Performance considerations addressed
- [ ] Documentation is updated
- [ ] Follows project standards

## Git Commands Reference

### Starting New Work

```bash
# Update main branch
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/123-add-feature

# Make changes and commit
git add .
git commit -m "feat(component): add new feature"

# Push to remote
git push -u origin feature/123-add-feature
```

### Keeping Branch Updated

```bash
# Fetch latest changes
git fetch origin

# Rebase on main
git rebase origin/main

# If conflicts, resolve and continue
git add .
git rebase --continue

# Force push after rebase
git push --force-with-lease
```

### Cleaning Up

```bash
# Delete local branch after merge
git branch -d feature/123-add-feature

# Delete remote branch
git push origin --delete feature/123-add-feature

# Prune deleted remote branches
git fetch --prune
```

## Merge Strategy

### Squash and Merge (Recommended)

- Combines all commits into one
- Keeps main branch history clean
- Use for feature branches

```bash
# GitHub UI: "Squash and merge" button
# Or via command line:
git checkout main
git merge --squash feature/123-add-feature
git commit -m "feat: add new feature (#123)"
```

### Rebase and Merge

- Maintains individual commits
- Linear history
- Use for well-organized commit history

### Merge Commit

- Preserves all commits and branch history
- Use for hotfixes or important feature branches

## Protected Branch Rules

### Main Branch Protection

- Require pull request reviews (minimum 1)
- Require status checks to pass
  - All tests pass
  - Code coverage ≥ 80%
  - Linting passes
  - Build succeeds
- Require branches to be up to date
- Require signed commits (optional)
- Restrict who can push
- Restrict who can force push (no one)

## Git Hooks

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Run linter
npm run lint

# Run tests
npm test

# Check coverage
npm run test:coverage
```

### Commit Message Hook

```bash
#!/bin/sh
# .git/hooks/commit-msg

# Validate commit message format
commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|test|chore|perf|ci)(\(.+\))?: .{1,50}"

if ! echo "$commit_msg" | grep -qE "$pattern"; then
  echo "Error: Commit message does not follow conventional commits format"
  echo "Format: <type>(<scope>): <subject>"
  exit 1
fi
```

## Best Practices

### Commit Frequency

- Commit often (logical units of work)
- Each commit should be buildable
- Don't commit broken code
- Don't commit commented-out code

### What to Commit

**Do Commit**:
- Source code
- Tests
- Documentation
- Configuration files
- Build scripts

**Don't Commit**:
- node_modules/
- dist/ or build/
- .env files
- IDE-specific files (.vscode/, .idea/)
- Log files
- Temporary files
- Secrets or credentials

### .gitignore

```
# Dependencies
node_modules/
package-lock.json

# Build output
dist/
build/
*.js.map

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Coverage
coverage/
.nyc_output/

# CDK
cdk.out/
.cdk.staging/

# Temporary
*.tmp
.cache/
```

## Troubleshooting

### Undo Last Commit (Not Pushed)

```bash
# Keep changes
git reset --soft HEAD~1

# Discard changes
git reset --hard HEAD~1
```

### Undo Pushed Commit

```bash
# Create revert commit
git revert HEAD
git push origin main
```

### Resolve Merge Conflicts

```bash
# During rebase
git status  # See conflicted files
# Edit files to resolve conflicts
git add .
git rebase --continue

# Abort rebase if needed
git rebase --abort
```

### Recover Deleted Branch

```bash
# Find commit hash
git reflog

# Recreate branch
git checkout -b feature/123-recovered <commit-hash>
```

## Summary

- Use feature branches for all work
- Follow conventional commits format
- Write clear, descriptive commit messages
- Create detailed pull requests
- Ensure all tests pass before merging
- Maintain ≥80% code coverage
- Keep main branch always deployable
- Review code thoroughly
- Clean up merged branches
