import { DrizzleQueryError } from 'drizzle-orm';
import { Client, type ClientConfig, DatabaseError } from 'pg';

// No `#/env` import: the cdc and yjs workers open their pools with this client too.

/** Errors a pool's client gave from a connect or a statement: the driver's or the server's, never a caller's own. */
const driverErrors = new WeakSet<Error>();

/**
 * How long one ask of `backendState` waits for its answer, its connect included; the wait before a second ask; and how
 * long an answer still on its way from a backend that has ended its statement gets before the connection ends.
 */
const askRules = { answerMs: 2_000, againMs: 3_000, lateAnswerMs: 1_000 } as const;

/** Backend states of a statement that has ended: its answer was lost on the way, and the connection never gets it. */
const endedStates = new Set(['idle', 'idle in transaction', 'idle in transaction (aborted)']);

/**
 * The state of the backend `pid` in `pg_stat_activity`, read on a connection of its own as the same role, which sees
 * the state of its own sessions. `gone` when the server holds no such backend; `unknown` when the server answered with
 * an error of its own (too many connections) or hides the state; undefined when it did not answer within `answerMs`.
 */
async function backendState(config: ClientConfig, pid: number): Promise<string | undefined> {
  const ask = new Client({ ...config, connectionTimeoutMillis: askRules.answerMs, query_timeout: askRules.answerMs });
  ask.on('error', () => undefined);
  const asking = (async () => {
    await ask.connect();
    const { rows } = await ask.query<{ state: string | null }>('select state from pg_stat_activity where pid = $1', [pid]);
    if (!rows[0]) return 'gone';
    return rows[0].state ?? 'unknown';
  })().catch((error: unknown) => (error instanceof DatabaseError ? 'unknown' : undefined));
  let timer: NodeJS.Timeout | undefined;
  const silence = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), askRules.answerMs);
  });
  try {
    return await Promise.race([asking, silence]);
  } finally {
    clearTimeout(timer);
    // A frozen server never answers the end.
    void ask.end().catch(() => undefined);
  }
}

/** A pool client's options: node-postgres's, and the deadline `DriverClient` keeps. */
export type DriverClientConfig = ClientConfig & {
  /** Milliseconds a statement may go unanswered before the client asks after its backend; absent = no limit. */
  clientDeadlineMs?: number;
};

/**
 * The client of every pool `createPgConnection` opens. It marks the errors it gives, which `isDatabaseUnavailable`
 * reads. With `clientDeadlineMs`, a statement unanswered that long makes it ask about the statement's own backend
 * (`backendState`). An active backend keeps its statement, however long it runs, and so does an answer that cannot
 * tell. A backend that is gone or has ended its statement ends the connection, and so does a second ask, `againMs`
 * after the first, that gets no answer either. Ending it fails at once the statement and whatever waits behind it on
 * the connection, a `ROLLBACK` among them.
 */
export class DriverClient extends Client {
  /** The backend's process id, from the server's key data: set on connect, null before. */
  declare readonly processID: number | null;
  readonly #config: DriverClientConfig;

  constructor(config: DriverClientConfig = {}) {
    super(config);
    this.#config = config;
  }

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
    let answered = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (error: unknown) => {
      answered = true;
      clearTimeout(timer);
      if (error instanceof Error) driverErrors.add(error);
    };
    const callback = args.at(-1);
    if (typeof callback === 'function') {
      args[args.length - 1] = (error: unknown, result: unknown) => {
        settle(error);
        callback(error, result);
      };
    }
    const answer = Reflect.apply(super.query, this, args);
    if (typeof callback !== 'function') {
      // A submittable (a cursor) answers through its own events: none runs on these pools.
      if (answer instanceof Promise) answer.then(() => settle(undefined), settle);
      else settle(undefined);
    }
    // Armed once the driver holds the statement, unref'd: it never outlives the statement or holds the process.
    const deadlineMs = this.#config.clientDeadlineMs;
    if (deadlineMs && !answered) {
      const arm = (ms: number, next: () => void) => {
        timer = setTimeout(next, ms);
        timer.unref();
      };
      const end = () => {
        if (!answered) this.end().catch(() => undefined);
      };
      const check = async (silentAsks: number) => {
        if (answered || this.processID === null) return;
        const state = await backendState(this.#config, this.processID);
        if (answered) return;
        if (state === undefined) {
          if (silentAsks) end();
          else arm(askRules.againMs, () => void check(1));
        } else if (state === 'gone' || endedStates.has(state)) arm(askRules.lateAnswerMs, end);
        else arm(deadlineMs, () => void check(0));
      };
      arm(deadlineMs, () => void check(0));
    }
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
