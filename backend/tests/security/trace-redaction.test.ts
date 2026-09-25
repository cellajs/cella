import { nanoid } from 'nanoid';
import pino from 'pino';
import { createOtelSDK, type OtelSDKOptions } from 'shared/otel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestLogger } from '#/lib/pino';
import { defaultHeaders } from '../fixtures';

type Exporter = NonNullable<OtelSDKOptions['traceExporter']>;
type ExportedSpan = Parameters<Exporter['export']>[0][number];

/** Keeps every exported span; shutting the SDK down flushes into it. */
const collectingExporter = (spans: ExportedSpan[]): Exporter => ({
  export: (batch, done) => {
    spans.push(...batch);
    done({ code: 0 });
  },
  shutdown: async () => {},
  forceFlush: async () => {},
});

/** One secret per carrier the app puts in a URL: a token path segment, token and OAuth query keys. */
const secrets = {
  magicPath: `magic_${nanoid(32)}`,
  invitationPath: `invitation_${nanoid(32)}`,
  unsubscribe: `unsub_${nanoid(32)}`,
  categoryUnsubscribe: `category_${nanoid(32)}`,
  oauthCode: `code_${nanoid(32)}`,
  oauthState: `state_${nanoid(32)}`,
};

const tokenUrls = [
  `/auth/invoke-token/magic/${secrets.magicPath}`,
  // Through the `/api` mount the load balancer preserves in production.
  `/api/auth/invoke-token/invitation/${secrets.invitationPath}`,
  `/me/unsubscribe?token=${secrets.unsubscribe}`,
  `/notifications/unsubscribe?user=${crypto.randomUUID()}&category=digest&token=${secrets.categoryUnsubscribe}`,
  `/auth/github/callback?code=${secrets.oauthCode}&state=${secrets.oauthState}`,
];

const expectNoSecret = (text: string) => {
  for (const secret of Object.values(secrets)) expect(text).not.toContain(secret);
};

/**
 * Tokens travel in request URLs (magic links, invitations, unsubscribe links, OAuth callbacks). Every request span
 * records its full URL and every request log line its path, so both must reach the telemetry backend scrubbed.
 */
describe('telemetry redaction', () => {
  it('must not export a token via a request span', async () => {
    const exported: ExportedSpan[] = [];
    const otel = createOtelSDK({
      serviceName: 'test-api',
      traceExporter: collectingExporter(exported),
      autoInstrumentations: false,
    });
    otel.start();
    const { baseApp } = await import('#/routes');

    for (const url of tokenUrls) await baseApp.request(url, { headers: defaultHeaders });
    await otel.shutdown();

    // Positive control: one server span per request, each carrying the scrubbed URL.
    const urls = exported.map((span) => span.attributes['url.full']).filter(Boolean);
    expect(urls).toHaveLength(tokenUrls.length);
    expect(urls).toEqual(
      expect.arrayContaining([
        'http://localhost/auth/invoke-token/magic/[REDACTED]',
        'http://localhost/me/unsubscribe?token=[REDACTED]',
        'http://localhost/auth/github/callback?code=[REDACTED]&state=[REDACTED]',
      ]),
    );
    expectNoSecret(
      JSON.stringify(
        exported.map((span) => ({
          name: span.name,
          attributes: span.attributes,
          events: span.events,
          status: span.status,
        })),
      ),
    );
  });

  describe('request log lines', () => {
    const lines: string[] = [];
    const originalLevel = requestLogger.level;
    const originalStream = Object.getOwnPropertyDescriptor(requestLogger, pino.symbols.streamSym);

    beforeAll(() => {
      requestLogger.level = 'info';
      Object.assign(requestLogger, { [pino.symbols.streamSym]: { write: (line: string) => lines.push(line) } });
    });

    afterAll(() => {
      requestLogger.level = originalLevel;
      if (originalStream) Object.defineProperty(requestLogger, pino.symbols.streamSym, originalStream);
    });

    it('must not leak a token via the request log line', async () => {
      const { baseApp } = await import('#/routes');

      for (const url of tokenUrls) await baseApp.request(url, { headers: defaultHeaders });

      // Positive control: the request logger wrote one line per request, with the scrubbed path.
      const logged = lines.map((line) => JSON.parse(line) as { url?: string });
      expect(logged.map((line) => line.url)).toEqual(
        expect.arrayContaining([
          'http://localhost/auth/invoke-token/magic/[REDACTED]',
          'http://localhost/me/unsubscribe?token=[REDACTED]',
        ]),
      );
      expect(logged).toHaveLength(tokenUrls.length);
      expectNoSecret(lines.join('\n'));
    });
  });
});
