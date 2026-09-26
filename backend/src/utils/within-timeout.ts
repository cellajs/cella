/**
 * Waits for `pending` at most `ms`. The timer never keeps the process alive, and `pending` goes on in the background
 * when the time runs out: the caller decides what an unanswered call means.
 * @param pending - The call to wait for; its value is not used.
 * @param ms - How long to wait, in milliseconds.
 * @returns True when `pending` resolved in time, false when it rejected or `ms` passed first.
 */
export async function withinTimeout(pending: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
    timer.unref();
  });
  try {
    return await Promise.race([pending.then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
