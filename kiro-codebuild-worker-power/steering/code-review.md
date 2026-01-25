# Code Review Guidelines

## Overview

This document defines code review standards and best practices for the Kiro CodeBuild Worker project. Code reviews are essential for maintaining code quality, sharing knowledge, and catching issues early.

## Code Review Principles

### Core Values

1. **Be Kind and Respectful** - Reviews are about the code, not the person
2. **Be Constructive** - Provide actionable feedback with suggestions
3. **Be Thorough** - Take time to understand the changes
4. **Be Timely** - Review promptly to avoid blocking progress
5. **Be Collaborative** - Work together to find the best solution

### Goals

- Maintain code quality and consistency
- Catch bugs and security issues early
- Share knowledge across the team
- Ensure adherence to project standards
- Improve overall codebase health

## Review Process

### Before Requesting Review

**Author Checklist**:
- [ ] All tests pass locally (`npm test`)
- [ ] Code coverage ≥ 80% (`npm run test:coverage`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Self-review completed
- [ ] PR description is complete and clear
- [ ] Related issues are linked
- [ ] Documentation is updated
- [ ] No debug code or console.log statements
- [ ] Commit messages follow conventional commits format

### Review Timeline

- **Small PRs** (< 200 lines): Review within 4 hours
- **Medium PRs** (200-500 lines): Review within 1 business day
- **Large PRs** (> 500 lines): Review within 2 business days

**Note**: Break large changes into smaller PRs when possible.

### Review Depth

**Every Review Must Check**:
1. Code correctness and logic
2. Test coverage and quality
3. Error handling
4. Security considerations
5. Performance implications
6. Code style and standards compliance
7. Documentation completeness

## Review Checklist

### Functionality

- [ ] Code does what the PR description says
- [ ] All acceptance criteria are met
- [ ] Edge cases are handled
- [ ] Error conditions are handled gracefully
- [ ] No obvious bugs or logic errors

### Code Quality

- [ ] Code is clear and readable
- [ ] Functions are small and focused (single responsibility)
- [ ] Variable and function names are descriptive
- [ ] No code duplication (DRY principle)
- [ ] No commented-out code
- [ ] No unnecessary complexity

### TypeScript Standards

- [ ] Strict TypeScript mode is used
- [ ] No `any` types (use specific types or `unknown`)
- [ ] Explicit return types on functions
- [ ] Proper use of interfaces vs types
- [ ] Async/await used consistently
- [ ] Proper error handling with custom error classes
- [ ] Immutability principles followed

### Testing

- [ ] All tests pass in CI/CD
- [ ] Code coverage ≥ 80% for all metrics
- [ ] Tests cover happy path scenarios
- [ ] Tests cover error conditions
- [ ] Tests cover edge cases
- [ ] Test names are descriptive
- [ ] No skipped or commented tests
- [ ] Mocks are used appropriately
- [ ] Integration tests added where needed

### Security

- [ ] No hardcoded secrets or credentials
- [ ] Input validation is present
- [ ] Sensitive data is sanitized in logs
- [ ] AWS SDK credentials use IAM roles
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Dependencies are up to date and secure

### Performance

- [ ] No unnecessary async operations
- [ ] Parallel operations use Promise.all
- [ ] AWS SDK clients are reused
- [ ] Database queries are optimized
- [ ] No memory leaks
- [ ] Appropriate caching is used

### Documentation

- [ ] Public APIs have JSDoc comments
- [ ] Complex logic has explanatory comments
- [ ] README is updated if needed
- [ ] API documentation is updated
- [ ] Breaking changes are documented

### Infrastructure (CDK)

- [ ] Stacks follow single responsibility principle
- [ ] IAM permissions follow least privilege
- [ ] Resources have appropriate tags
- [ ] Encryption is enabled
- [ ] Monitoring and alarms are configured
- [ ] Cost optimization is considered
- [ ] CDK tests are included

## Providing Feedback

### Comment Types

**Use Clear Labels**:
- **[BLOCKING]**: Must be fixed before merge
- **[SUGGESTION]**: Nice to have, but not required
- **[QUESTION]**: Seeking clarification
- **[NITPICK]**: Minor style or formatting issue
- **[PRAISE]**: Positive feedback on good code

### Examples

**Good Feedback**:
```
[BLOCKING] This function doesn't handle the case when `items` is empty.
Consider adding a guard clause:

if (items.length === 0) {
  return [];
}
```

**Bad Feedback**:
```
This is wrong.
```

**Good Feedback**:
```
[SUGGESTION] Consider extracting this logic into a separate function
for better testability and reusability. Something like:

function validateWorkItem(item: WorkItem): ValidationResult {
  // validation logic
}
```

**Bad Feedback**:
```
Too complex.
```

**Good Feedback**:
```
[QUESTION] Why are we using a Set here instead of an Array?
Is it for performance or to ensure uniqueness?
```

**Bad Feedback**:
```
Why Set?
```

**Good Feedback**:
```
[PRAISE] Excellent error handling! The custom error classes make
debugging much easier.
```

### Feedback Guidelines

**Do**:
- Be specific about what needs to change
- Explain why the change is needed
- Provide code examples when helpful
- Ask questions to understand intent
- Acknowledge good code
- Focus on the most important issues first

**Don't**:
- Make personal comments
- Be vague or unclear
- Nitpick excessively on style (use linter instead)
- Rewrite the entire PR in comments
- Approve without actually reviewing

## Responding to Feedback

### As the Author

**Do**:
- Respond to all comments
- Ask for clarification if needed
- Explain your reasoning
- Make requested changes or discuss alternatives
- Thank reviewers for their time
- Mark conversations as resolved when addressed

**Don't**:
- Take feedback personally
- Ignore comments
- Get defensive
- Make changes without understanding why
- Rush through revisions

### Response Examples

**Good Response**:
```
Good catch! I've added the null check and a test case for this scenario.
Updated in commit abc123.
```

**Good Response**:
```
I considered that approach, but chose this one because [reason].
However, I'm open to changing it if you think the benefits outweigh
the trade-offs. What do you think?
```

**Good Response**:
```
I'm not sure I understand this comment. Could you elaborate on what
you mean by "more efficient"? Are you concerned about time complexity
or memory usage?
```

## Review Approval

### When to Approve

Approve when:
- All blocking issues are resolved
- Code meets quality standards
- Tests pass with ≥80% coverage
- Documentation is complete
- You would be comfortable maintaining this code

### When to Request Changes

Request changes when:
- Blocking issues remain unresolved
- Tests are failing
- Coverage is below 80%
- Security vulnerabilities exist
- Code doesn't meet standards

### When to Comment Without Approval

Comment without approval when:
- You have questions but no blocking issues
- You want to provide suggestions
- You're not the primary reviewer
- You're reviewing for learning purposes

## Special Review Scenarios

### Large Pull Requests

For PRs > 500 lines:
1. Review in multiple passes
2. Focus on architecture first
3. Then review implementation details
4. Consider breaking into smaller PRs

### Urgent Hotfixes

For critical production issues:
1. Expedite review (< 1 hour)
2. Focus on correctness and safety
3. Verify rollback plan exists
4. Follow up with thorough review post-deployment

### Refactoring PRs

For refactoring changes:
1. Verify behavior is unchanged
2. Check test coverage remains ≥80%
3. Ensure performance is not degraded
4. Validate improved maintainability

### Infrastructure Changes

For CDK/infrastructure PRs:
1. Review IAM permissions carefully
2. Check for security implications
3. Verify cost impact
4. Ensure monitoring is in place
5. Validate rollback procedure

## Common Issues and Solutions

### Issue: Tests Not Covering Edge Cases

**Feedback**:
```
[BLOCKING] The tests don't cover the case when the API returns a 429
rate limit error. Please add a test for this scenario.
```

### Issue: Missing Error Handling

**Feedback**:
```
[BLOCKING] This async operation doesn't have error handling. If the
API call fails, the application will crash. Consider wrapping in
try-catch and handling the error appropriately.
```

### Issue: Hardcoded Values

**Feedback**:
```
[SUGGESTION] Consider moving these magic numbers to named constants
at the top of the file or in a config file. This makes them easier
to maintain and understand.

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
```

### Issue: Complex Function

**Feedback**:
```
[SUGGESTION] This function is doing multiple things (validation,
transformation, and API call). Consider breaking it into smaller
functions, each with a single responsibility.
```

### Issue: Missing Documentation

**Feedback**:
```
[BLOCKING] This public API function needs JSDoc documentation
explaining the parameters, return value, and any exceptions it
might throw.
```

### Issue: Performance Concern

**Feedback**:
```
[QUESTION] This loop makes an API call for each item. For large
arrays, this could be slow. Have you considered batching these
requests or using Promise.all for parallel execution?
```

## Review Metrics

### Healthy Review Metrics

- **Review turnaround time**: < 1 business day average
- **Comments per PR**: 3-10 (too few = rubber stamp, too many = needs smaller PRs)
- **Approval rate**: 70-90% (too high = not thorough, too low = unclear requirements)
- **Revision rounds**: 1-2 average (more indicates unclear requirements)

### Red Flags

- PRs approved without comments
- Same reviewer always approves immediately
- PRs sitting unreviewed for days
- Excessive back-and-forth (> 5 rounds)
- Tests consistently failing in CI

## Tools and Automation

### Automated Checks

Before human review, automated checks should verify:
- Tests pass
- Coverage ≥ 80%
- Linting passes
- Build succeeds
- No security vulnerabilities (npm audit)
- Dependencies are up to date

### Code Review Tools

- **GitHub PR Reviews**: Primary review platform
- **GitHub Actions**: Automated CI/CD checks
- **Codecov**: Coverage reporting and tracking
- **SonarQube**: Code quality and security analysis (optional)

## Learning from Reviews

### For Authors

- Keep a list of common feedback you receive
- Work on improving those areas
- Ask questions when you don't understand
- Apply learnings to future PRs

### For Reviewers

- Notice patterns in issues you find
- Suggest process improvements
- Share knowledge through reviews
- Mentor junior developers

## Summary

### Quick Reference

**Before Requesting Review**:
1. All tests pass (≥80% coverage)
2. Self-review completed
3. Documentation updated
4. PR description is clear

**During Review**:
1. Be kind and constructive
2. Focus on important issues first
3. Provide specific, actionable feedback
4. Use clear labels ([BLOCKING], [SUGGESTION], etc.)

**Before Approving**:
1. All blocking issues resolved
2. Tests pass with ≥80% coverage
3. Code meets quality standards
4. You'd be comfortable maintaining this code

**Remember**: Code reviews are a collaborative process. The goal is to improve the code and share knowledge, not to criticize the author.
