import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { AppError, type ErrorKey } from '#/core/error';
import { toClientError } from '#/lib/error';
import { i18n } from '#/lib/i18n';

/** What a client outside development sees of a thrown value. */
const seenByClient = (err: unknown) => {
  const {
    name: _name,
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
      message: 'Internal server error',
    });
  });

  it('answers an exhausted pool as the service being unavailable', () => {
    expect(seenByClient(new Error('timeout exceeded when trying to connect'))).toMatchObject({
      status: 503,
      type: 'service_unavailable',
      severity: 'error',
    });
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
      message: 'Malformed JSON in request body',
    });
    expect(seenByClient(new HTTPException(403))).toMatchObject({ status: 403, type: 'forbidden' });
    expect(seenByClient(new HTTPException(502, { message: 'upstream said no' }))).toMatchObject({
      type: 'server_error',
      message: 'Internal server error',
    });
  });
});

describe('AppError', () => {
  it("takes the type's general text as its message", () => {
    expect(new AppError(409, 'last_admin', 'warn').message).toBe(
      'An organization always keeps at least one admin. Make someone else an admin first.',
    );
    // A type without a `.text` falls back to its title.
    expect(new AppError(409, 'slug_exists', 'warn').message).toBe('Slug already exists');
  });

  it('keeps the message written at the throw, which a client outside development never sees for a 5xx', () => {
    const error = new AppError(500, 'server_error', 'error', { message: 'orgGuard requires tenantGuard middleware' });

    expect(error.message).toBe('orgGuard requires tenantGuard middleware');
    expect(toClientError(error, {}, { exposeServerMessage: true }).message).toBe('orgGuard requires tenantGuard middleware');
    expect(seenByClient(error).message).toBe('Internal server error');
  });

  it("reads a type from the app's own texts first, so an app adds types and can reword a template one", () => {
    i18n.addResourceBundle('en', 'appError', {
      label_mode_locked: 'Mode is fixed',
      'label_mode_locked.text': 'A primary label keeps its mode.',
      slug_exists: 'Handle taken',
    });

    try {
      const refusal = new AppError(409, 'label_mode_locked' as ErrorKey, 'warn');
      expect(seenByClient(refusal)).toEqual({ status: 409, type: 'label_mode_locked', severity: 'warn', message: 'A primary label keeps its mode.' });
      expect(refusal.name).toBe('Mode is fixed');

      expect(new AppError(409, 'slug_exists', 'warn').name).toBe('Handle taken');
    } finally {
      i18n.removeResourceBundle('en', 'appError');
    }
  });
});
