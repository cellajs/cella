export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long a caller waits for a step before it goes on without it, in ms: the short one for a step whose loss costs
 * little, the long one where giving up costs the person something (their session, a question, the stored cache).
 */
export const shortWaitMs = 3000;
export const longWaitMs = 10_000;

/** Waits for `promise` at most `ms` and never rejects: resolves whether it settled by then, a rejection included. */
export const settleWithin = (ms: number, promise: Promise<unknown>): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const settled = () => {
      clearTimeout(timer);
      resolve(true);
    };
    promise.then(settled, settled);
  });

/** Resolves at once in a visible tab, else when the tab is next shown. */
export const whenVisible = (): Promise<void> =>
  typeof document === 'undefined' || !document.hidden
    ? Promise.resolve()
    : new Promise((resolve) => {
        const onChange = () => {
          if (document.hidden) return;
          document.removeEventListener('visibilitychange', onChange);
          resolve();
        };
        document.addEventListener('visibilitychange', onChange);
      });
