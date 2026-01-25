/**
 * Secret sanitization utility to redact sensitive information from strings
 */

const REDACTED = '[REDACTED]';

/**
 * Patterns to match sensitive information
 */
const SENSITIVE_PATTERNS = [
  // Tokens (various formats)
  /token[=:\s]+[\w\-._]+/gi,
  /bearer\s+[\w\-._]+/gi,
  /ghp_[\w]+/gi,  // GitHub personal access token
  /gho_[\w]+/gi,  // GitHub OAuth token
  /ghs_[\w]+/gi,  // GitHub server token
  
  // Passwords
  /password[=:\s]+\S+/gi,
  /passwd[=:\s]+\S+/gi,
  /pwd[=:\s]+\S+/gi,
  
  // API keys
  /api[_-]?key[=:\s]+[\w\-]+/gi,
  /apikey[=:\s]+[\w\-]+/gi,
  
  // AWS credentials
  /AKIA[0-9A-Z]{16}/g,  // AWS Access Key ID
  /aws[_-]?secret[_-]?access[_-]?key[=:\s]+[\w/+=]+/gi,
  
  // Generic secrets
  /secret[=:\s]+[\w\-._]+/gi,
  /private[_-]?key[=:\s]+[\w\-._]+/gi
];

/**
 * Sanitizes a string by replacing sensitive information with [REDACTED]
 * 
 * @param input - The string to sanitize
 * @returns The sanitized string with sensitive information redacted
 */
export function sanitizeString(input: string): string {
  let sanitized = input;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep the prefix (e.g., "token=") but redact the value
      const separatorIndex = match.search(/[=:\s]/);
      if (separatorIndex !== -1) {
        return match.substring(0, separatorIndex + 1) + REDACTED;
      }
      return REDACTED;
    });
  }
  
  return sanitized;
}

/**
 * Sanitizes an error object by redacting sensitive information from message and stack
 * 
 * @param error - The error to sanitize
 * @returns A new error with sanitized message and stack
 */
export function sanitizeError(error: Error): Error {
  const sanitized = new Error(sanitizeString(error.message));
  sanitized.name = error.name;
  
  if (error.stack) {
    sanitized.stack = sanitizeString(error.stack);
  }
  
  return sanitized;
}

/**
 * Sanitizes an object by recursively redacting sensitive information from string values
 * 
 * @param obj - The object to sanitize
 * @returns A new object with sanitized values
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    
    return sanitized as T;
  }
  
  return obj;
}
