import { DrizzleQueryError } from 'drizzle-orm';
import { Client, DatabaseError } from 'pg';

// No `#/env` import: the cdc and yjs workers open their pools with this client too.

/** Errors a pool's client gave from a connect or a statement: the driver's or the server's, never a caller's own. */
const driverErrors = new WeakSet<Error>();

/** The client of every pool `createPgConnection` opens. It marks the errors it gives, which `isDatabaseUnavailable` reads. */
export class DriverClient extends Client {
  // biome-ignore lint/suspicious/noExplicitAny: one forwarder for both forms of node-postgres's `connect`.
  override connect(...args: any[]): any {
    const callback = args[0];
    if (typeof callback === 'function') {
      return super.connect((error: Error | null, client?: Client) => {
        if (error) driverErrors.add(error);
        callback(error, client);
      });
    }
    return super.connect().catch((error: unknown) => {
      if (error instanceof Error) driverErrors.add(error);
      throw error;
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: one forwarder for every overload of node-postgres's `query`.
  override query(...args: any[]): any {
    const mark = (error: unknown) => {
      if (error instanceof Error) driverErrors.add(error);
    };
    const callback = args.at(-1);
    if (typeof callback === 'function') {
      args[args.length - 1] = (error: unknown, result: unknown) => {
        mark(error);
        callback(error, result);
      };
    }
    const answer = Reflect.apply(super.query, this, args);
    // A submittable (a cursor) answers through its own events: none runs on these pools.
    if (answer instanceof Promise) answer.catch(mark);
    return answer;
  }
}

/**
 * SQLSTATEs of a server that cannot serve now: shutting down or starting (57P01 to 57P03), out of connections (53300)
 * or out of disk (53100). Class 08, a connection exception, counts whole. A write refused in a read-only transaction
 * (25006) is the caller's fault: every tenant read opens `BEGIN READ ONLY`.
 */
const unavailableStates = new Set(['57P01', '57P02', '57P03', '53300', '53100']);

/** Node's codes for a connection never made or cut: the database's only on a chain that holds a database error. */
const connectionCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);

/**
 * How node-postgres's and pg-pool's own errors begin for a connection lost, never made or past its deadline. They carry
 * no code, and only an error without one is read: a server's error quotes the caller's values in its message.
 */
const unavailableMessages = [
  'Connection terminated',
  'timeout exceeded when trying to connect',
  'Cannot use a pool after calling end',
  'Query read timeout',
  'Client has encountered a connection error',
  'Client was closed and is not queryable',
];

/** An error drizzle, the server or a pool's client gave. */
const isDatabaseError = (error: Error) => error instanceof DrizzleQueryError || error instanceof DatabaseError || driverErrors.has(error);

/**
 * Whether an error, or one down its `cause` chain, says the database cannot be reached or did not answer in time: a
 * retry may pass. A statement the server cancelled for its own timeout (57014) is no outage.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  const chain: Error[] = [];
  for (let current = error; chain.length < 5 && current instanceof Error; current = current.cause) chain.push(current);
  const fromDatabase = chain.some(isDatabaseError);
  return chain.some((link) => {
    const code = 'code' in link && typeof link.code === 'string' ? link.code : '';
    if (unavailableStates.has(code) || code.startsWith('08')) return true;
    if (code) return fromDatabase && connectionCodes.has(code);
    return unavailableMessages.some((known) => link.message.startsWith(known));
  });
}
