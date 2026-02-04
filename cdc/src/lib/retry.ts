import { RESOURCE_LIMITS, TRANSIENT_ERROR_CODES } from '../constants';
import { logEvent } from '../pino';

const { retry: RETRY_CONFIG } = RESOURCE_LIMITS;

// Check if an error is transient and should be retried.
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // Check for PostgreSQL error code property
  const code =
    'code' in error && typeof (error as { code: unknown }).code === 'string'
      ? error.code as string
      : null;

  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
  

  // Also check for common transient error messages
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const transientPatterns = [
    'connection refused',
    'connection reset',
    'connection terminated',
    'timeout',
    'deadlock',
    'could not connect',
    'too many clients',
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Extract PostgreSQL error code from an error if available.
 */
export function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

type RetryResult<T> =
  | { success: true; value: T; attempts: number }
  | { success: false; error: Error; attempts: number; isTransient: boolean };

/**
 * Execute an async function with exponential backoff retry for transient errors.
 *
 * @param fn - The async function to execute
 * @param context - Context string for logging (e.g., "insert activity")
 * @returns RetryResult indicating success or failure with metadata
 */
export async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<RetryResult<T>> {
  let lastError: Error = new Error('No attempts made');
  let isLastErrorTransient = false;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { success: true, value, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      isLastErrorTransient = isTransientError(error);

      // Only retry if error is transient and we have attempts left
      if (!isLastErrorTransient || attempt >= RETRY_CONFIG.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
        RETRY_CONFIG.maxDelayMs,
      );

      logEvent('warn', `Transient error during ${context}, retrying...`, {
        attempt,
        maxAttempts: RETRY_CONFIG.maxAttempts,
        delayMs: delay,
        errorCode: getErrorCode(error),
        errorMessage: lastError.message,
      });


      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: RETRY_CONFIG.maxAttempts,
    isTransient: isLastErrorTransient,
  };
}
