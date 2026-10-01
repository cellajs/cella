import { createOtelSDK } from 'shared/otel';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectingExporter, defaultHeaders, type ExportedSpan } from './fixtures';

type Answer = { status: number; header: string | null; body: Record<string, unknown> };

/** A user quotes one id for a failed request: the server makes it, and the header, error body and request span carry it. */
describe('request id', () => {
  const exported: ExportedSpan[] = [];
  const answers: Answer[] = [];

  beforeAll(async () => {
    const otel = createOtelSDK({ serviceName: 'test-api', traceExporter: collectingExporter(exported), autoInstrumentations: false });
    otel.start();
    const { baseApp } = await import('#/routes');

    // Without a session `/me` answers 401 with an error body; the second request brings an id of its own.
    for (const headers of [defaultHeaders, { ...defaultHeaders, 'X-Request-Id': 'caller-chosen-id' }]) {
      const response = await baseApp.request('/me', { headers });
      answers.push({ status: response.status, header: response.headers.get('X-Request-Id'), body: await response.json() });
    }
    await otel.shutdown();
  });

  it('answers an error with the request id of its header', () => {
    for (const { status, header, body } of answers) {
      expect(status).toBe(401);
      expect(header).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.requestId).toBe(header);
      expect(body).not.toHaveProperty('logId');
    }
  });

  it('must not take the request id from the caller', () => {
    const [first, second] = answers;
    expect(second.header).not.toBe('caller-chosen-id');
    expect(second.header).not.toBe(first.header);
  });

  it('records the request id on the request span', () => {
    const recorded = exported.map((span) => span.attributes['http.response.header.x-request-id']);
    expect(recorded).toEqual(expect.arrayContaining(answers.map(({ header }) => header)));
  });
});
