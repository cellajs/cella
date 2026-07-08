/** Dependency-free sleep, so this module can be included by the boot agent
 *  (whose tsup bundle must not reach into the `shared` workspace package). */
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RetryOptions {
  /** Total number of attempts before giving up. */
  attempts: number
  /** Delay between attempts, in milliseconds. */
  delayMs: number
  /** Called after a failed attempt that will be retried (not on the last one). */
  onRetry?: (attempt: number, error: unknown) => void
  /** Injectable for tests; defaults to a real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Run `fn` up to `opts.attempts` times, sleeping `opts.delayMs` between failures.
 * Resolves with the first success; rejects with the last error if all attempts fail.
 */
export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep
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

export interface PollUntilOptions {
  /** Total number of probe attempts before giving up. */
  attempts: number
  /** Delay between attempts, in milliseconds (skipped after the last attempt). */
  intervalMs: number
  /** Injectable for tests; defaults to a real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Probe until `probe` returns a non-undefined value (the poll's result), or the
 * attempt budget is spent (undefined). Unlike {@link retry}, a probe that
 * "misses" is not an error: it simply returns undefined to keep polling, so
 * per-attempt logging and terminal fast-fail decisions live inside the probe.
 */
export async function pollUntil<T>(probe: (attempt: number) => Promise<T | undefined>, opts: PollUntilOptions): Promise<T | undefined> {
  const sleep = opts.sleep ?? defaultSleep
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    const result = await probe(attempt)
    if (result !== undefined) return result
    if (attempt < opts.attempts) await sleep(opts.intervalMs)
  }
  return undefined
}
