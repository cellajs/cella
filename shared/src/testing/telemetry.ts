import { randomUUID } from 'node:crypto';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { createLogger } from '../pino.ts';

/** An exporter that keeps every span it receives; unlike InMemorySpanExporter, shutting the SDK down keeps them. */
export const collectingExporter = (spans: ReadableSpan[]): SpanExporter => ({
  export: (batch, done) => {
    spans.push(...batch);
    done({ code: 0 });
  },
  shutdown: async () => {},
  forceFlush: async () => {},
});

/** A logger built through `createLogger` as the services build theirs, writing its lines to memory. */
export const collectingLogger = (redactPaths: readonly string[]) => {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    isProduction: true,
    isTest: false,
    redactPaths,
    destination: { write: (line: string) => lines.push(line) },
  });
  return { logger, lines, parsed: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
};

/** The error Drizzle throws for a failed query, as drizzle-orm builds it: the SQL and the values in the message. */
class DrizzleQueryError extends Error {
  query: string;
  params: unknown[];
  constructor(query: string, params: unknown[], cause: Error) {
    super(`Failed query: ${query}\nparams: ${params}`);
    this.name = 'DrizzleQueryError';
    this.query = query;
    this.params = params;
    this.cause = cause;
  }
}

/**
 * A failed lookup by a secret value, as Drizzle throws it: the SQL and the value (spanning two lines) in its message
 * and so in its stack, the database's error as its cause. `cause` may quote the secret, as a unique violation's
 * `detail` does. The secret is built at run time: a test proves it never reaches its output.
 */
export function failedLookup(
  cause: (secret: string) => Error = () => Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: '22021' }),
) {
  const secret = `secret_${randomUUID()}`;
  const sql = 'select "id" from "sessions" where "sessions"."secret" = $1';
  const failure = cause(secret);
  return { secret, sql, reason: failure.message, error: new DrizzleQueryError(sql, [`${secret}\nsecond line`], failure) };
}
