import { RESOURCE_LIMITS, TRANSIENT_ERROR_CODES } from '../constants';
import { log } from '../lib/pino';

const { retry: RETRY_CONFIG } = RESOURCE_LIMITS;

/** Check if an error is transient and should be retried. */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // Check for PostgreSQL error code (also unwraps Drizzle-wrapped errors via .cause)
  const code = getErrorCode(error);
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

/** Type guard for objects with a string `code` property (e.g., PostgreSQL errors). */
function hasErrorCode(value: unknown): value is { code: string } {
  return typeof value === 'object' && value !== null && 'code' in value && typeof (value as { code: unknown }).code === 'string';
}

/**
 * Extract PostgreSQL error code from an error if available.
 * Also checks .cause for Drizzle-wrapped errors.
 */
export function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if (hasErrorCode(error)) return error.code;
  // Drizzle-wrapped: check .cause
  const cause = error instanceof Error ? error.cause : undefined;
  if (hasErrorCode(cause)) return cause.code;
  return null;
}

type RetryResult<T> =
  | { success: true; value: T; attempts: number }
  | { success: false; error: Error; attempts: number; isTransient: boolean };

/**
 * Execute an async function with exponential backoff retry for transient errors.
 * @param context - label for logging (e.g., "insert activity")
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

      if (!isLastErrorTransient || attempt >= RETRY_CONFIG.maxAttempts) {
        break;
      }

      const delay = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
        RETRY_CONFIG.maxDelayMs,
      );

      log.warn(`Transient error during ${context}, retrying...`, {
        attempt,
        maxAttempts: RETRY_CONFIG.maxAttempts,
        delayMs: delay,
        errorCode: getErrorCode(error),
        err: lastError,
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
