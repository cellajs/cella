import { sleep } from 'shared/sleep'

export interface RetryOptions {
  /** Total number of attempts before giving up. */
  attempts: number
  /** Delay between attempts, in milliseconds. */
  delayMs: number
  /** Called after a failed attempt that will be retried (not on the last one). */
  onRetry?: (attempt: number, error: unknown) => void
}

/**
 * Run `fn` up to `opts.attempts` times, sleeping `opts.delayMs` between failures.
 * Resolves with the first success; rejects with the last error if all attempts fail.
 */
export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt < opts.attempts) {
        opts.onRetry?.(attempt, error)
        await sleep(opts.delayMs)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('retry: all attempts failed')
}
