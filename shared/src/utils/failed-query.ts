const failedQueryPrefix = 'Failed query: ';

/** What a failed query's SQL and values become where the database's own reason is not at hand. */
export const redactedFailedQuery = `${failedQueryPrefix}[REDACTED]`;

/** Drizzle's failed-query text, `Failed query: <sql>\nparams: <values>`: values that span lines end at the first stack frame. */
const failedQueryPattern = /Failed query: [\s\S]*?\nparams: [\s\S]*?(?=\n {4}at |$)/g;

/** True for the message of Drizzle's `DrizzleQueryError`, which carries the SQL and every value the query bound. */
export const isFailedQueryMessage = (message: string): boolean =>
  message.startsWith(failedQueryPrefix) && message.includes('\nparams: ');

/**
 * Replaces the SQL and bound values of every failed query quoted in a text, such as a stack an error took over from a
 * failed query, with `Failed query: [REDACTED]`. The values can hold tokens, email addresses and anything else a query
 * was given.
 * @param text - Any text that may quote a failed query.
 * @returns The text without the queries and their values; unchanged when it quotes none.
 */
export const redactFailedQuery = (text: string): string =>
  text.includes(failedQueryPrefix) ? text.replace(failedQueryPattern, redactedFailedQuery) : text;

/**
 * The message to log or trace for a failed query: the database's own reason (the cause Drizzle wraps), which names the
 * problem without the SQL or its values.
 * @param cause - The failed query's cause.
 */
export const failedQueryReason = (cause: unknown): string => {
  const message = typeof cause === 'object' && cause !== null ? (cause as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : redactedFailedQuery;
};

/**
 * A failed query as it may be logged or traced: the same name and cause, the database's reason as its message, and
 * its stack with that reason in place of the query. Any other value is returned as it is.
 * @param err - A thrown value.
 */
export const withoutFailedQuery = (err: unknown): unknown => {
  if (!(err instanceof Error) || !isFailedQueryMessage(err.message)) return err;
  const reason = failedQueryReason(err.cause);
  const safe = new Error(reason, { cause: err.cause });
  safe.name = err.name;
  safe.stack = err.stack?.split(err.message).join(reason);
  return safe;
};
