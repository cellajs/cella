import { nanoid } from 'nanoid';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';

const testMode = appConfig.mode;

/** Answers a request whose insert fails in Postgres (a NUL in a text value), under the given app mode. */
const failQueryIn = async (mode: typeof appConfig.mode) => {
  Reflect.set(appConfig, 'mode', mode);
  const { baseApp } = await import('#/routes');
  // Built at run time: the test proves this value never reaches the client.
  const marker = `marker_${nanoid(16)}`;
  const response = await baseApp.request('/requests', {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify({ email: `${nanoid(8)}@example.test`, type: 'contact', message: `${marker}\u0000` }),
  });
  const text = await response.text();
  return { status: response.status, text, marker, body: JSON.parse(text) as ErrorResponse };
};

/**
 * A server error's own message names server internals: for a failed query, the SQL and the values it bound. A client
 * sees it only where the client is the developer, in development and in tests; a public staging, a tunnel and
 * production answer a fixed message.
 */
describe('Server error messages', () => {
  afterEach(() => {
    Reflect.set(appConfig, 'mode', testMode);
  });

  it('must not reveal a failed query via a server error outside development', async () => {
    for (const mode of ['staging', 'tunnel', 'production'] as const) {
      const { status, text, marker, body } = await failQueryIn(mode);

      expect(status, mode).toBe(500);
      expect(body.message, mode).toBe('Internal server error');
      expect(text, mode).not.toContain(marker);
      expect(text.toLowerCase(), mode).not.toMatch(/failed query|insert into/);
    }
  });

  it('shows the server message in development (positive control)', async () => {
    const { status, body } = await failQueryIn('development');

    expect(status).toBe(500);
    expect(body.message).toMatch(/^Failed query: insert into/);
  });
});
