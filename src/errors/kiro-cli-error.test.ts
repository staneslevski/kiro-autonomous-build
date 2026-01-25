import { describe, it, expect } from 'vitest';
import { KiroCLIError } from './kiro-cli-error';

describe('KiroCLIError', () => {
  it('should create error with message and command', () => {
    const error = new KiroCLIError(
      'Kiro CLI execution failed',
      'kiro execute-task --spec .kiro/specs/test --task 1.1'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(KiroCLIError);
    expect(error.name).toBe('KiroCLIError');
    expect(error.message).toBe('Kiro CLI execution failed');
    expect(error.command).toBe('kiro execute-task --spec .kiro/specs/test --task 1.1');
    expect(error.exitCode).toBeUndefined();
    expect(error.output).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('should create error with exit code', () => {
    const error = new KiroCLIError(
      'Command failed with exit code 1',
      'kiro execute-task',
      1
    );

    expect(error.exitCode).toBe(1);
  });

  it('should create error with output', () => {
    const output = 'Error: Task not found\nStack trace...';
    const error = new KiroCLIError(
      'Kiro CLI failed',
      'kiro execute-task',
      1,
      output
    );

    expect(error.output).toBe(output);
  });

  it('should create error with cause', () => {
    const cause = new Error('Underlying error');
    const error = new KiroCLIError(
      'Kiro CLI failed',
      'kiro execute-task',
      1,
      undefined,
      cause
    );

    expect(error.cause).toBe(cause);
  });

  it('should create error with all parameters', () => {
    const cause = new Error('Underlying error');
    const output = 'Error output';
    const error = new KiroCLIError(
      'Complete error',
      'kiro execute-task --spec test --task 1.1',
      127,
      output,
      cause
    );

    expect(error.message).toBe('Complete error');
    expect(error.command).toBe('kiro execute-task --spec test --task 1.1');
    expect(error.exitCode).toBe(127);
    expect(error.output).toBe(output);
    expect(error.cause).toBe(cause);
  });

  it('should have proper stack trace', () => {
    const error = new KiroCLIError('Test error', 'kiro test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('KiroCLIError');
  });
});
