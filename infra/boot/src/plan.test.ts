import { describe, expect, it } from 'vitest';
import { parseBootPlanJson as parsePlan } from './plan';

/** Where cloud-init writes the plan, and so the one /etc directory it may name. */
const planPath = '/etc/cella/boot-plan.json';
const parseBootPlanJson = (json: string) => parsePlan(json, planPath);

const link = 'https://cella-boot-diag.s3.nl-ams.scw.cloud/x?X-Amz-Signature=00';
const archive = { name: 'backend', image: 'rg.nl-ams.scw.cloud/ns/backend:abc123', url: link, sha256: 'a'.repeat(64) };

function plan(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 2,
    service: 'backend',
    profile: 'backend',
    services: ['backend'],
    releaseSha: 'abc123',
    imageContract: 'docker-node-boot-v1',
    links: { env: link, bootAccount: link, archives: [archive] },
    bootDiagnostics: { logFile: '/var/log/infra-boot.log' },
    docker: { composeFile: '/opt/app/compose.yml' },
    files: { compose: 'services: {}', env: 'BACKEND_TAG=abc' },
    timeouts: { privateNetworkSeconds: 150, fetchAttempts: 2, fetchRetrySeconds: 1, composeWaitSeconds: 240 },
    ...overrides,
  });
}

describe('parseBootPlanJson', () => {
  it('parses a valid schema-v2 boot plan', () => {
    expect(parseBootPlanJson(plan()).links.archives).toEqual([archive]);
  });

  it('rejects unsupported schema and image contract, and the fields of a plan that carried keys', () => {
    expect(() => parseBootPlanJson(plan({ schemaVersion: 1 }))).toThrow(/unsupported schemaVersion/);
    expect(() => parseBootPlanJson(plan({ imageContract: 'docker-only' }))).toThrow(/unsupported imageContract/);
    expect(() => parseBootPlanJson(plan({ credentials: { scwSecretKeyFile: '/etc/cella/scw-secret-key' } }))).toThrow(/unknown top-level field/);
  });

  it('must not fetch or upload through anything but an https link, nor load an archive without its digest', () => {
    expect(() => parseBootPlanJson(plan({ links: { env: 'http://169.254.42.42/', bootAccount: link, archives: [] } }))).toThrow(/https link/);
    expect(() => parseBootPlanJson(plan({ links: { env: link, bootAccount: link, archives: [{ ...archive, sha256: 'abc' }] } }))).toThrow(
      /no sha256/,
    );
  });

  it('must not write outside the boot paths via dot segments or doubled slashes', () => {
    for (const composeFile of [
      '/opt/app/../../etc/sudoers.d/x',
      '/opt/app/./compose.yml',
      '/opt/app//compose.yml',
      'opt/app/compose.yml',
      '/tmp/c.yml',
    ]) {
      expect(() => parseBootPlanJson(plan({ docker: { composeFile } }))).toThrow(/outside the allowed/);
    }
    expect(() => parseBootPlanJson(plan({ bootDiagnostics: { logFile: '/var/log/../../etc/shadow' } }))).toThrow(/outside the allowed/);
  });
});
