import { describe, expect, it } from 'vitest';
import { parseBootPlanJson as parsePlan } from './plan';

/** Where cloud-init writes the plan, and so the one /etc directory it may name. */
const planPath = '/etc/cella/boot-plan.json';
const parseBootPlanJson = (json: string) => parsePlan(json, planPath);

function plan(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    service: 'backend',
    profile: 'backend',
    releaseSha: 'abc123',
    imageContract: 'docker-node-boot-v1',
    registry: 'rg.nl-ams.scw.cloud/ns',
    region: 'nl-ams',
    credentials: { scwAccessKeyFile: '/etc/cella/scw-access-key', scwSecretKeyFile: '/etc/cella/scw-secret-key' },
    bootDiagnostics: { bucket: 'cella-boot-diag', logFile: '/var/log/infra-boot.log' },
    releaseCommand: { enabled: true, command: ['docker', 'compose', 'run', 'backend-release'] },
    docker: { composeFile: '/opt/app/compose.yml' },
    files: {
      compose: 'services: {}',
      env: 'BACKEND_TAG=abc',
      runtimeSecretManifest: [{ envVar: 'COOKIE_SECRET', secretId: 'uuid', required: true }],
    },
    timeouts: { privateNetworkSeconds: 150, pullAttempts: 2, pullRetrySeconds: 1 },
    ...overrides,
  });
}

describe('parseBootPlanJson', () => {
  it('parses a valid schema-v1 boot plan', () => {
    expect(parseBootPlanJson(plan()).service).toBe('backend');
  });

  it('rejects unsupported schema and image contract', () => {
    expect(() => parseBootPlanJson(plan({ schemaVersion: 2 }))).toThrow(/unsupported schemaVersion/);
    expect(() => parseBootPlanJson(plan({ imageContract: 'docker-only' }))).toThrow(/unsupported imageContract/);
  });

  it('rejects unknown top-level fields', () => {
    expect(() => parseBootPlanJson(plan({ surprise: true }))).toThrow(/unknown top-level field/);
  });

  it('parses the optional start-services list, absent in pre-collocation plans', () => {
    expect(parseBootPlanJson(plan()).services).toBeUndefined();
    expect(parseBootPlanJson(plan({ services: ['backend', 'frontend'] })).services).toEqual(['backend', 'frontend']);
    expect(() => parseBootPlanJson(plan({ services: [] }))).toThrow(/non-empty command array/);
  });

  it('rejects empty release commands', () => {
    expect(() => parseBootPlanJson(plan({ releaseCommand: { enabled: true, command: [] } }))).toThrow(
      /non-empty command array/,
    );
    expect(() => parseBootPlanJson(plan({ releaseCommand: { enabled: true, command: ['docker', ''] } }))).toThrow(
      /empty or non-string/,
    );
  });

  it('rejects paths outside allowed boot locations', () => {
    expect(() => parseBootPlanJson(plan({ docker: { composeFile: '/tmp/compose.yml' } }))).toThrow(
      /outside the allowed/,
    );
  });

  it('must not write outside the boot paths via dot segments or doubled slashes', () => {
    for (const composeFile of [
      '/opt/app/../../etc/sudoers.d/x',
      '/opt/app/../etc/cron.d/x',
      '/opt/app/./compose.yml',
      '/opt/app//compose.yml',
      'opt/app/compose.yml',
    ]) {
      expect(() => parseBootPlanJson(plan({ docker: { composeFile } }))).toThrow(/outside the allowed/);
    }
    const logFile = '/var/log/../../etc/shadow';
    expect(() => parseBootPlanJson(plan({ bootDiagnostics: { bucket: 'b', logFile } }))).toThrow(/outside the allowed/);
  });

  it("must not read or write an /etc directory other than the plan's own", () => {
    const credentials = (scwAccessKeyFile: string) => ({
      credentials: { scwAccessKeyFile, scwSecretKeyFile: '/etc/cella/scw-secret-key' },
    });
    expect(() => parseBootPlanJson(plan(credentials('/etc/ssh/x')))).toThrow(/outside the allowed/);
    expect(() => parseBootPlanJson(plan(credentials('/etc/runtime-secrets/x')))).toThrow(/outside the allowed/);
    const handoff = (cacheFile: string) => ({ serviceKeyHandoff: { secretId: 's', cacheFile } });
    expect(() => parseBootPlanJson(plan(handoff('/etc/sudoers.d/x')))).toThrow(/outside the allowed/);
    expect(() => parseBootPlanJson(plan(handoff('/etc/cella-other/service-key.json')))).toThrow(/outside the allowed/);
    expect(() => parsePlan(plan(), '/etc/acme/boot-plan.json')).toThrow(/outside the allowed/);
  });

  it('accepts the paths the plan producer writes (positive control)', () => {
    const parsed = parseBootPlanJson(plan(handoffPlan()));
    expect(parsed.credentials.scwAccessKeyFile).toBe('/etc/cella/scw-access-key');
    expect(parsed.serviceKeyHandoff?.cacheFile).toBe('/etc/cella/service-key.json');
    expect(parsed.docker.composeFile).toBe('/opt/app/compose.yml');
    expect(parsed.bootDiagnostics.logFile).toBe('/var/log/infra-boot.log');
  });
});

function handoffPlan() {
  return { serviceKeyHandoff: { secretId: 'secret-id', cacheFile: '/etc/cella/service-key.json' } };
}
