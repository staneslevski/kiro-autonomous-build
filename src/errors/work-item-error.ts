/**
 * Error thrown when work item processing fails
 */

export class WorkItemError extends Error {
  public readonly workItemId?: string;
  public readonly cause?: Error;

  constructor(message: string, workItemId?: string, cause?: Error) {
    super(message);
    this.name = 'WorkItemError';
    this.workItemId = workItemId;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkItemError);
    }
  }
}
