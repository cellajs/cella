import { DrizzleQueryError } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';
import { AppError, type ErrorKey } from '#/core/error';
import { toClientError } from '#/lib/error';
import { i18n } from '#/lib/i18n';
import enError from '../../../../shared/locales/en/error.json';

/** What a client outside development sees of a thrown value. */
const seenByClient = (err: unknown) => {
  const {
    title: _title,
    willRedirect: _willRedirect,
    entityType: _entityType,
    meta: _meta,
    ...seen
  } = toClientError(err, {}, { exposeServerMessage: false });
  return seen;
};

/**
 * `type` is what a client branches on and translates, so each kind of failure answers with a type that says what
 * happened: `server_error` is the server's own fault alone.
 */
describe('toClientError', () => {
  it('answers anything unexpected as a server error without its message', () => {
    expect(seenByClient(new TypeError('Cannot read properties of undefined'))).toEqual({
      status: 500,
      type: 'server_error',
      severity: 'error',
      detail: 'Internal server error',
    });
  });

  it('answers an exhausted pool as the service being unavailable', () => {
    expect(seenByClient(new Error('timeout exceeded when trying to connect'))).toMatchObject({
      status: 503,
      type: 'service_unavailable',
      severity: 'error',
    });
  });

  it('answers a database that cannot be reached or did not answer in time as unavailable, with the wait to retry, when drizzle wraps it too', () => {
    const unavailable = [
      new Error('timeout exceeded when trying to connect'),
      new Error('Connection terminated due to connection timeout'),
      new Error('Connection terminated'),
      new Error('Client was closed and is not queryable'),
      Object.assign(new DatabaseError('the database system is shutting down', 0, 'error'), { code: '57P03' }),
      Object.assign(new DatabaseError('terminating connection due to administrator command', 0, 'error'), { code: '57P01' }),
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
    ];
    for (const cause of unavailable) {
      expect(toClientError(new DrizzleQueryError('select 1', [], cause), {}, { exposeServerMessage: false }), cause.message).toMatchObject({
        status: 503,
        type: 'service_unavailable',
        meta: { retryAfter: 1 },
      });
    }
  });

  it('answers what a caller wrote, a cancelled statement, a write in a read-only transaction and a mail service cut off as before, never as an outage', () => {
    const quoted = Object.assign(new DatabaseError('invalid input syntax for type uuid: "Query read timeout"', 0, 'error'), { code: '22P02' });
    expect(seenByClient(new DrizzleQueryError('select 1 where id = $1', ['Query read timeout'], quoted))).toMatchObject({
      status: 400,
      type: 'invalid_request',
    });
    const cancelled = Object.assign(new DatabaseError('canceling statement due to statement timeout', 0, 'error'), { code: '57014' });
    expect(seenByClient(new DrizzleQueryError('select 1', [], cancelled))).toMatchObject({ status: 500, type: 'server_error' });
    // Every tenant read opens `BEGIN READ ONLY`: a write inside one is a bug, which a retry repeats.
    const readOnly = Object.assign(new DatabaseError('cannot execute UPDATE in a read-only transaction', 0, 'error'), { code: '25006' });
    expect(seenByClient(new DrizzleQueryError('update users set id = id', [], readOnly))).toMatchObject({ status: 500, type: 'server_error' });
    const mailer = new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
    expect(seenByClient(mailer)).toMatchObject({ status: 500, type: 'server_error' });
  });

  it('answers a deadlock and a serialization failure as a write conflict to retry', () => {
    for (const code of ['40P01', '40001']) {
      expect(seenByClient(Object.assign(new Error('conflict'), { code })), code).toMatchObject({
        status: 409,
        type: 'write_conflict',
        severity: 'warn',
      });
    }
  });

  it('answers a refusal by the framework as a fault in the request, with its own message', () => {
    expect(seenByClient(new HTTPException(400, { message: 'Malformed JSON in request body' }))).toEqual({
      status: 400,
      type: 'invalid_request',
      severity: 'warn',
      detail: 'Malformed JSON in request body',
    });
    expect(seenByClient(new HTTPException(403))).toMatchObject({ status: 403, type: 'forbidden' });
    expect(seenByClient(new HTTPException(502, { message: 'upstream said no' }))).toMatchObject({
      type: 'server_error',
      detail: 'Internal server error',
    });
  });
});

describe('AppError', () => {
  it("takes the type's general text as its message", () => {
    expect(new AppError(409, 'last_admin', 'warn').message).toBe(enError['last_admin.text']);
    // A type without a `.text` falls back to its title.
    expect(new AppError(400, 'passkey_registration_failed', 'warn').message).toBe(enError.passkey_registration_failed);
  });

  it('keeps the message written at the throw, which a client outside development never sees for a 5xx', () => {
    const error = new AppError(500, 'server_error', 'error', { message: 'orgGuard requires tenantGuard middleware' });

    expect(error.message).toBe('orgGuard requires tenantGuard middleware');
    expect(toClientError(error, {}, { exposeServerMessage: true }).detail).toBe('orgGuard requires tenantGuard middleware');
    expect(seenByClient(error).detail).toBe('Internal server error');
  });

  it("reads a type from the app's own texts first, so an app adds types and can reword a template one", () => {
    i18n.addResourceBundle('en', 'appError', {
      label_mode_locked: 'Mode is fixed',
      'label_mode_locked.text': 'A primary label keeps its mode.',
      slug_exists: 'Handle taken',
    });

    try {
      const refusal = new AppError(409, 'label_mode_locked' as ErrorKey, 'warn');
      expect(seenByClient(refusal)).toEqual({ status: 409, type: 'label_mode_locked', severity: 'warn', detail: 'A primary label keeps its mode.' });
      expect(toClientError(refusal).title).toBe('Mode is fixed');

      expect(toClientError(new AppError(409, 'slug_exists', 'warn')).title).toBe('Handle taken');
    } finally {
      i18n.removeResourceBundle('en', 'appError');
    }
  });
});
