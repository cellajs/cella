/**
 * Waits for `pending` at most `ms`. The timer never keeps the process alive, and `pending` goes on in the background
 * when the time runs out: the caller decides what an unanswered call means.
 * @param pending - The call to wait for; its value is not used.
 * @param ms - How long to wait, in milliseconds.
 * @param what - Names the call in the error a timeout returns.
 * @returns Undefined when `pending` resolved in time; else its rejection, or an error saying `what` got no answer.
 */
export async function withinTimeout(
  pending: Promise<unknown>,
  ms: number,
  what = 'The call',
): Promise<Error | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Error>((resolve) => {
    timer = setTimeout(() => resolve(new Error(`${what} got no answer within ${ms} ms`)), ms);
    timer.unref();
  });
  try {
    return await Promise.race([pending.then(() => undefined), timeout]);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}
