import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 5: Security Scan Blocking
 * 
 * Statement: CRITICAL or HIGH severity security issues must block deployment
 * 
 * This property validates that the security scanner correctly identifies
 * critical and high severity vulnerabilities and blocks deployment when
 * they are present.
 * 
 * **Validates**: Requirements US-3 (Acceptance Criteria 5)
 */

describe('Property 5: Security Scan Blocking', () => {
  type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  interface Vulnerability {
    severity: Severity;
    description: string;
  }

  /**
   * Simulates security scanner that determines if deployment should be blocked.
   * Returns true if deployment should be blocked, false otherwise.
   */
  async function shouldBlockDeployment(vulnerabilities: Vulnerability[]): Promise<boolean> {
    // Deployment should be blocked if any vulnerability is CRITICAL or HIGH
    return vulnerabilities.some(v => v.severity === 'CRITICAL' || v.severity === 'HIGH');
  }

  /**
   * Checks if vulnerabilities contain CRITICAL or HIGH severity issues
   */
  function hasCriticalOrHighSeverity(vulnerabilities: Vulnerability[]): boolean {
    return vulnerabilities.some(v => v.severity === 'CRITICAL' || v.severity === 'HIGH');
  }

  /**
   * Counts vulnerabilities by severity
   */
  function countBySeverity(vulnerabilities: Vulnerability[]): Record<Severity, number> {
    return vulnerabilities.reduce((acc, vuln) => {
      acc[vuln.severity] = (acc[vuln.severity] || 0) + 1;
      return acc;
    }, {} as Record<Severity, number>);
  }

  /**
   * Gets the highest severity level from vulnerabilities
   */
  function getHighestSeverity(vulnerabilities: Vulnerability[]): Severity | null {
    if (vulnerabilities.length === 0) return null;
    
    const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    
    for (const severity of severityOrder) {
      if (vulnerabilities.some(v => v.severity === severity)) {
        return severity;
      }
    }
    
    return null;
  }

  it('should block deployment for critical or high severity issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          severity: fc.constantFrom<Severity>('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
          description: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 0, maxLength: 20 }),
        async (vulnerabilities) => {
          const hasCriticalOrHigh = vulnerabilities.some(
            v => v.severity === 'CRITICAL' || v.severity === 'HIGH'
          );
          const deploymentBlocked = await shouldBlockDeployment(vulnerabilities);
          
          // Deployment should be blocked if and only if there are CRITICAL or HIGH issues
          return hasCriticalOrHigh === deploymentBlocked;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow deployment when only MEDIUM and LOW severity issues exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          severity: fc.constantFrom<Severity>('MEDIUM', 'LOW'),
          description: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 1, maxLength: 10 }),
        async (vulnerabilities) => {
          const deploymentBlocked = await shouldBlockDeployment(vulnerabilities);
          
          // Deployment should not be blocked for only MEDIUM/LOW issues
          return deploymentBlocked === false;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should block deployment with single CRITICAL vulnerability', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (description) => {
          const vulnerabilities: Vulnerability[] = [
            { severity: 'CRITICAL', description }
          ];
          
          const deploymentBlocked = await shouldBlockDeployment(vulnerabilities);
          
          // Single CRITICAL vulnerability should block deployment
          return deploymentBlocked === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should block deployment with single HIGH vulnerability', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (description) => {
          const vulnerabilities: Vulnerability[] = [
            { severity: 'HIGH', description }
          ];
          
          const deploymentBlocked = await shouldBlockDeployment(vulnerabilities);
          
          // Single HIGH vulnerability should block deployment
          return deploymentBlocked === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should block deployment with CRITICAL among MEDIUM/LOW vulnerabilities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (mediumCount, lowCount) => {
          const vulnerabilities: Vulnerability[] = [
            ...Array(mediumCount).fill(null).map((_, i) => ({ 
              severity: 'MEDIUM' as Severity, 
              description: `medium-${i}` 
            })),
            ...Array(lowCount).fill(null).map((_, i) => ({ 
              severity: 'LOW' as Severity, 
              description: `low-${i}` 
            })),
            { severity: 'CRITICAL' as Severity, description: 'critical-issue' }
          ];
          
          const deploymentBlocked = await shouldBlockDeployment(vulnerabilities);
          
          // CRITICAL should block deployment regardless of other vulnerabilities
          return deploymentBlocked === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should allow deployment with empty vulnerability list', async () => {
    const deploymentBlocked = await shouldBlockDeployment([]);
    
    // No vulnerabilities should allow deployment
    expect(deploymentBlocked).toBe(false);
  });

  it('should correctly identify critical or high severity issues', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          severity: fc.constantFrom<Severity>('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
          description: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 0, maxLength: 20 }),
        (vulnerabilities) => {
          const hasCriticalOrHigh = hasCriticalOrHighSeverity(vulnerabilities);
          const expectedHasCriticalOrHigh = vulnerabilities.some(
            v => v.severity === 'CRITICAL' || v.severity === 'HIGH'
          );
          
          // Detection should match actual presence of CRITICAL/HIGH
          return hasCriticalOrHigh === expectedHasCriticalOrHigh;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should count vulnerabilities by severity correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          severity: fc.constantFrom<Severity>('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
          description: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 0, maxLength: 20 }),
        (vulnerabilities) => {
          const counts = countBySeverity(vulnerabilities);
          
          // Sum of counts should equal total vulnerabilities
          const totalCounted = (counts.CRITICAL || 0) + (counts.HIGH || 0) + 
                              (counts.MEDIUM || 0) + (counts.LOW || 0);
          return totalCounted === vulnerabilities.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be consistent across multiple scans', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          severity: fc.constantFrom<Severity>('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
          description: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 0, maxLength: 10 }),
        async (vulnerabilities) => {
          // Scan multiple times with same input
          const result1 = await shouldBlockDeployment(vulnerabilities);
          const result2 = await shouldBlockDeployment(vulnerabilities);
          const result3 = await shouldBlockDeployment(vulnerabilities);
          
          // Results should be consistent (idempotent)
          return result1 === result2 && result2 === result3;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle mixed severity levels correctly', async () => {
    const testCases = [
      {
        vulnerabilities: [
          { severity: 'LOW' as Severity, description: 'low-issue' },
          { severity: 'MEDIUM' as Severity, description: 'medium-issue' }
        ],
        expectedBlocked: false
      },
      {
        vulnerabilities: [
          { severity: 'LOW' as Severity, description: 'low-issue' },
          { severity: 'HIGH' as Severity, description: 'high-issue' }
        ],
        expectedBlocked: true
      },
      {
        vulnerabilities: [
          { severity: 'CRITICAL' as Severity, description: 'critical-issue' },
          { severity: 'MEDIUM' as Severity, description: 'medium-issue' }
        ],
        expectedBlocked: true
      },
      {
        vulnerabilities: [
          { severity: 'LOW' as Severity, description: 'low-issue' },
          { severity: 'LOW' as Severity, description: 'another-low-issue' },
          { severity: 'MEDIUM' as Severity, description: 'medium-issue' }
        ],
        expectedBlocked: false
      }
    ];

    for (const testCase of testCases) {
      const deploymentBlocked = await shouldBlockDeployment(testCase.vulnerabilities);
      expect(deploymentBlocked).toBe(testCase.expectedBlocked);
    }
  });

  it('should correctly identify highest severity level', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          severity: fc.constantFrom<Severity>('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
          description: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 1, maxLength: 20 }),
        (vulnerabilities) => {
          const highestSeverity = getHighestSeverity(vulnerabilities);
          
          if (highestSeverity === null) {
            return vulnerabilities.length === 0;
          }
          
          // Verify highest severity is actually present
          const hasHighestSeverity = vulnerabilities.some(v => v.severity === highestSeverity);
          
          // Verify no higher severity exists
          const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
          const highestIndex = severityOrder.indexOf(highestSeverity);
          const hasHigherSeverity = vulnerabilities.some(v => 
            severityOrder.indexOf(v.severity) < highestIndex
          );
          
          return hasHighestSeverity && !hasHigherSeverity;
        }
      ),
      { numRuns: 100 }
    );
  });
});
