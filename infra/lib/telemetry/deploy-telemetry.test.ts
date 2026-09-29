import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deployEvents, emitDeployEvent, initDeployTelemetry, resetDeployTelemetry } from './deploy-telemetry';

// Built at run time: stand-ins for the deploy job's secrets.
const secret = (label: string) => `${label}-${randomBytes(12).toString('hex')}`;

afterEach(() => {
  resetDeployTelemetry();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * The deploy runs with the Scaleway keys, the Pulumi passphrase and a GitHub token in its environment, and a failing
 * step reports its error message, which can quote any of them (a DSN in a driver error, a key in a CLI's echo).
 */
describe('deploy telemetry', () => {
  it('must not export or keep a deploy secret via an event', async () => {
    const secretKey = secret('scw-sk');
    const passphrase = secret('pulumi-pp');
    const githubToken = secret('ghs');
    const ingestKey = secret('ingest');
    const dbPassword = secret('pg-pw');
    vi.stubEnv('SCW_SECRET_KEY', secretKey);
    vi.stubEnv('PULUMI_CONFIG_PASSPHRASE', passphrase);
    vi.stubEnv('GITHUB_TOKEN', githubToken);
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    const telemetry = initDeployTelemetry({
      mode: 'staging',
      sha: 'abc1234',
      endpoint: 'https://ingest.example/v1',
      headers: { 'x-ingest-key': ingestKey },
    });
    emitDeployEvent(
      deployEvents.stepFailed,
      {
        step: 'stack-update',
        error: [
          `scw: key ${secretKey} refused`,
          `passphrase ${passphrase}`,
          `token=${githubToken}`,
          `ingest ${ingestKey}`,
          `postgresql://app:${dbPassword}@10.0.0.5/app`,
        ].join('; '),
      },
      { severity: 'error' },
    );
    await telemetry.flush();

    const exported = fetchImpl.mock.calls.map(([, init]) => String(init?.body)).join('\n');
    const kept = telemetry.eventsJsonl();
    for (const value of [secretKey, passphrase, githubToken, ingestKey, dbPassword]) {
      expect(exported).not.toContain(value);
      expect(kept).not.toContain(value);
    }
    // Positive control: the event was exported, and its harmless facts survive.
    expect(exported).toContain('deploy.step.failed');
    expect(kept).toContain('stack-update');
    expect(kept).toContain('scw: key [REDACTED] refused');
  });
});
