import { DrizzleQueryError } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createOtelSDK, type OtelSDKOptions } from 'shared/otel';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { toClientError } from '#/lib/error';
import { defaultHeaders } from '../fixtures';

type Exporter = NonNullable<OtelSDKOptions['traceExporter']>;
type ExportedSpan = Parameters<Exporter['export']>[0][number];

// The backend's event log (`baseLog`, which `log` and `toClientError` write through), built the way the app builds it
// but writing its lines here.
const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('#/lib/pino', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/pino')>();
  const { createLog, createLogger } = await import('shared/pino');
  const logger = createLogger({
    level: 'info',
    isProduction: true,
    isTest: false,
    redactPaths: actual.backendRedactPaths,
    destination: { write: (line: string) => logged.lines.push(line) },
  });
  return { ...actual, baseLog: createLog(logger) };
});

/** Keeps every exported span; shutting the SDK down flushes into it. */
const collectingExporter = (spans: ExportedSpan[]): Exporter => ({
  export: (batch, done) => {
    spans.push(...batch);
    done({ code: 0 });
  },
  shutdown: async () => {},
  forceFlush: async () => {},
});

/**
 * A failed query's error carries its SQL and every value it bound, in its message and stack and as `params`: request
 * values, email addresses, a token looked up by its value. The error log line and the request span's exception event
 * keep only what the database said.
 */
describe('failed queries in telemetry', () => {
  const exported: ExportedSpan[] = [];
  // Built at run time: the test proves this value never leaves the process.
  const secret = `leak_${nanoid(24)}`;
  const reason = 'invalid byte sequence for encoding "UTF8": 0x00';
  let status = 0;

  beforeAll(async () => {
    const otel = createOtelSDK({
      serviceName: 'test-api',
      traceExporter: collectingExporter(exported),
      autoInstrumentations: false,
    });
    otel.start();
    const { baseApp } = await import('#/routes');

    // Postgres refuses a NUL in a text value, so the insert of this contact request fails with its values bound.
    const response = await baseApp.request('/requests', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ email: `${nanoid(8)}@example.test`, type: 'contact', message: `${secret}\u0000` }),
    });
    status = response.status;
    await otel.shutdown();
  });

  afterAll(() => {
    logged.lines.length = 0;
  });

  it('must not log a request value via a failed query', () => {
    expect(status).toBe(500);
    expect(logged.lines.join('\n')).not.toContain(secret);

    // Positive control: toClientError logged the failure with the database's reason.
    const errorLine = logged.lines
      .map((line) => JSON.parse(line) as { msg?: string; err?: { type?: string; message?: string } })
      .find((line) => line.err?.type === 'DrizzleQueryError');
    expect(errorLine?.msg).toBe('DrizzleQueryError: server_error');
    expect(errorLine?.err?.message).toBe(reason);
  });

  it('must not export a request value via a failed query', () => {
    const spans = exported.map(({ name, attributes, events, status }) => ({ name, attributes, events, status }));
    expect(JSON.stringify(spans)).not.toContain(secret);

    // Positive control: the request span recorded the exception with the database's reason.
    const exception = exported
      .flatMap((span) => span.events)
      .find((event) => event.attributes?.['exception.type'] === 'DrizzleQueryError');
    expect(exception?.attributes?.['exception.message']).toBe(reason);
    expect(exception?.attributes?.['exception.stacktrace']).toMatch(/^DrizzleQueryError: invalid byte sequence/);
  });
});

/**
 * A constraint violation answers 409 without a query to redact, and its `detail` quotes the row it refused: a unique
 * violation names the value that collided. The error log line keeps the database's code and constraint only.
 */
describe('refused writes in the error log', () => {
  it("must not log a colliding value via a database error's detail", () => {
    // Built at run time: the test proves this value never reaches a log line.
    const taken = `taken_${nanoid(16)}@example.test`;
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "emails_email_unique"'), {
      code: '23505',
      constraint: 'emails_email_unique',
      detail: `Key (email)=(${taken}) already exists.`,
    });
    const refused = new DrizzleQueryError('insert into "emails" ("email") values ($1)', [taken], cause);

    expect(toClientError(refused)).toMatchObject({ status: 409, type: 'resource_already_exists' });
    const lines = logged.lines.filter((line) => line.includes('resource_already_exists'));
    expect(lines).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(taken);
    // Positive control: the line names the database's code and constraint.
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ pgCode: '23505', pgConstraint: 'emails_email_unique' });
  });
});
