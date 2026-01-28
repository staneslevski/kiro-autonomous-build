/**
 * Unit tests for Custom Error Classes
 */

import { describe, it, expect } from 'vitest';
import {
  PipelineError,
  RollbackError,
  HealthCheckError,
  SecurityScanError,
  SecurityViolation,
} from '../../lib/errors';

describe('Custom Error Classes', () => {
  describe('PipelineError', () => {
    it('should create error with message and stage', () => {
      const error = new PipelineError('Build failed', 'Build');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PipelineError);
      expect(error.name).toBe('PipelineError');
      expect(error.message).toBe('Build failed');
      expect(error.stage).toBe('Build');
      expect(error.cause).toBeUndefined();
    });
    
    it('should create error with cause', () => {
      const originalError = new Error('Original error');
      const error = new PipelineError('Build failed', 'Build', originalError);
      
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe('Original error');
    });
    
    it('should have stack trace', () => {
      const error = new PipelineError('Build failed', 'Build');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('PipelineError');
    });
    
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new PipelineError('Build failed', 'Build');
      }).toThrow(PipelineError);
      
      try {
        throw new PipelineError('Build failed', 'Build');
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        if (error instanceof PipelineError) {
          expect(error.stage).toBe('Build');
        }
      }
    });
  });
  
  describe('RollbackError', () => {
    it('should create error with message and deployment', () => {
      const error = new RollbackError('Rollback failed', 'deploy-123');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RollbackError);
      expect(error.name).toBe('RollbackError');
      expect(error.message).toBe('Rollback failed');
      expect(error.deployment).toBe('deploy-123');
      expect(error.cause).toBeUndefined();
    });
    
    it('should create error with cause', () => {
      const originalError = new Error('Artifacts not found');
      const error = new RollbackError('Rollback failed', 'deploy-123', originalError);
      
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe('Artifacts not found');
    });
    
    it('should have stack trace', () => {
      const error = new RollbackError('Rollback failed', 'deploy-123');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('RollbackError');
    });
    
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new RollbackError('Rollback failed', 'deploy-123');
      }).toThrow(RollbackError);
      
      try {
        throw new RollbackError('Rollback failed', 'deploy-123');
      } catch (error) {
        expect(error).toBeInstanceOf(RollbackError);
        if (error instanceof RollbackError) {
          expect(error.deployment).toBe('deploy-123');
        }
      }
    });
  });
  
  describe('HealthCheckError', () => {
    it('should create error with message and failed alarms', () => {
      const failedAlarms = ['alarm-1', 'alarm-2'];
      const error = new HealthCheckError('Health checks failed', failedAlarms);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HealthCheckError);
      expect(error.name).toBe('HealthCheckError');
      expect(error.message).toBe('Health checks failed');
      expect(error.failedAlarms).toEqual(failedAlarms);
      expect(error.cause).toBeUndefined();
    });
    
    it('should create error with cause', () => {
      const originalError = new Error('CloudWatch error');
      const error = new HealthCheckError(
        'Health checks failed',
        ['alarm-1'],
        originalError
      );
      
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe('CloudWatch error');
    });
    
    it('should handle empty failed alarms array', () => {
      const error = new HealthCheckError('Health checks failed', []);
      
      expect(error.failedAlarms).toEqual([]);
    });
    
    it('should have stack trace', () => {
      const error = new HealthCheckError('Health checks failed', ['alarm-1']);
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('HealthCheckError');
    });
    
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new HealthCheckError('Health checks failed', ['alarm-1']);
      }).toThrow(HealthCheckError);
      
      try {
        throw new HealthCheckError('Health checks failed', ['alarm-1', 'alarm-2']);
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        if (error instanceof HealthCheckError) {
          expect(error.failedAlarms).toHaveLength(2);
        }
      }
    });
  });
  
  describe('SecurityScanError', () => {
    it('should create error with message and violations', () => {
      const violations: SecurityViolation[] = [
        {
          rule: 'S3-ENCRYPTION',
          severity: 'CRITICAL',
          resource: 'my-bucket',
          description: 'S3 bucket not encrypted',
        },
      ];
      
      const error = new SecurityScanError('Security violations found', violations);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SecurityScanError);
      expect(error.name).toBe('SecurityScanError');
      expect(error.message).toBe('Security violations found');
      expect(error.violations).toEqual(violations);
      expect(error.cause).toBeUndefined();
    });
    
    it('should create error with cause', () => {
      const originalError = new Error('Scan failed');
      const violations: SecurityViolation[] = [
        { rule: 'S3-ENCRYPTION', severity: 'HIGH' },
      ];
      
      const error = new SecurityScanError(
        'Security violations found',
        violations,
        originalError
      );
      
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe('Scan failed');
    });
    
    it('should handle multiple violations', () => {
      const violations: SecurityViolation[] = [
        { rule: 'S3-ENCRYPTION', severity: 'CRITICAL' },
        { rule: 'IAM-WILDCARD', severity: 'HIGH' },
        { rule: 'LAMBDA-DLQ', severity: 'MEDIUM' },
      ];
      
      const error = new SecurityScanError('Security violations found', violations);
      
      expect(error.violations).toHaveLength(3);
      expect(error.violations[0].severity).toBe('CRITICAL');
      expect(error.violations[1].severity).toBe('HIGH');
      expect(error.violations[2].severity).toBe('MEDIUM');
    });
    
    it('should handle empty violations array', () => {
      const error = new SecurityScanError('Security violations found', []);
      
      expect(error.violations).toEqual([]);
    });
    
    it('should have stack trace', () => {
      const error = new SecurityScanError('Security violations found', [
        { rule: 'S3-ENCRYPTION', severity: 'CRITICAL' },
      ]);
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('SecurityScanError');
    });
    
    it('should be throwable and catchable', () => {
      const violations: SecurityViolation[] = [
        { rule: 'S3-ENCRYPTION', severity: 'CRITICAL' },
      ];
      
      expect(() => {
        throw new SecurityScanError('Security violations found', violations);
      }).toThrow(SecurityScanError);
      
      try {
        throw new SecurityScanError('Security violations found', violations);
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityScanError);
        if (error instanceof SecurityScanError) {
          expect(error.violations).toHaveLength(1);
        }
      }
    });
  });
  
  describe('Error inheritance', () => {
    it('should all inherit from Error', () => {
      const pipelineError = new PipelineError('Test', 'Build');
      const rollbackError = new RollbackError('Test', 'deploy-123');
      const healthCheckError = new HealthCheckError('Test', []);
      const securityScanError = new SecurityScanError('Test', []);
      
      expect(pipelineError).toBeInstanceOf(Error);
      expect(rollbackError).toBeInstanceOf(Error);
      expect(healthCheckError).toBeInstanceOf(Error);
      expect(securityScanError).toBeInstanceOf(Error);
    });
    
    it('should have correct error names', () => {
      const pipelineError = new PipelineError('Test', 'Build');
      const rollbackError = new RollbackError('Test', 'deploy-123');
      const healthCheckError = new HealthCheckError('Test', []);
      const securityScanError = new SecurityScanError('Test', []);
      
      expect(pipelineError.name).toBe('PipelineError');
      expect(rollbackError.name).toBe('RollbackError');
      expect(healthCheckError.name).toBe('HealthCheckError');
      expect(securityScanError.name).toBe('SecurityScanError');
    });
  });
});
