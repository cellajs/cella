import { describe, expect, it } from 'vitest';
import { evaluateStatus } from './evaluate';
import type { Check, StatusInputs } from './types';

/** A fully-healthy bootstrapped staging stack; override per test. */
function base(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return {
    mode: 'staging',
    stackState: 'bootstrapped',
    tooling: { pulumi: true, dockerBuildx: true, gh: true },
    hasDomain: true,
    credentialsAvailable: true,
    projectId: 'proj-1',
    adminAppId: 'app-1',
    github: { authenticated: true, repo: 'org/repo', environmentExists: true, missingSecrets: [] },
    stateBucketExists: true,
    lock: { held: false },
    rollout: [
      { slug: 'backend', activeSha: 'abc123def456' },
      { slug: 'frontend', activeSha: 'abc123def456' },
    ],
    requiredSecretsMissing: [],
    live: [
      {
        slug: 'backend',
        healthUrl: 'https://api.example.com/health',
        probe: { status: 204, version: 'abc123def456' },
        expectedSha: 'abc123def456',
      },
      {
        slug: 'frontend',
        healthUrl: 'https://app.example.com/health',
        probe: { status: 200, version: 'abc123def456' },
        expectedSha: 'abc123def456',
      },
    ],
    dns: { host: 'app.example.com', resolvedIps: ['1.2.3.4'] },
    ...overrides,
  };
}

const find = (checks: Check[], id: string): Check | undefined => checks.find((c) => c.id === id);

describe('evaluateStatus envelope (public contract)', () => {
  it('has the documented top-level shape and schema version', () => {
    const report = evaluateStatus(base());
    expect(Object.keys(report).sort()).toEqual([
      'checks',
      'mode',
      'nextAction',
      'schemaVersion',
      'stackState',
      'summary',
    ]);
    expect(report.schemaVersion).toBe(1);
    expect(report.mode).toBe('staging');
    expect(report.stackState).toBe('bootstrapped');
  });

  it('summary counts every status bucket and sums to the check count', () => {
    const report = evaluateStatus(base());
    expect(Object.keys(report.summary).sort()).toEqual(['error', 'missing', 'ok', 'unknown', 'warn']);
    const total = Object.values(report.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.checks.length);
  });

  it('every check carries id, title, status, detail, credential', () => {
    for (const check of evaluateStatus(base()).checks) {
      expect(check.id).toBeTruthy();
      expect(check.title).toBeTruthy();
      expect(['ok', 'warn', 'missing', 'unknown', 'error']).toContain(check.status);
      expect(['none', 'scaleway']).toContain(check.credential);
    }
  });

  it('a healthy stack is all-ok with no next action', () => {
    const report = evaluateStatus(base());
    expect(report.nextAction).toBeUndefined();
    expect(report.summary.ok).toBe(report.checks.length);
  });
});

describe('credential degradation', () => {
  it('scaleway-tier checks are unknown (not error) without credentials', () => {
    const report = evaluateStatus(
      base({
        credentialsAvailable: false,
        stateBucketExists: undefined,
        lock: undefined,
        rollout: undefined,
        requiredSecretsMissing: undefined,
      }),
    );
    for (const id of ['state.bucket', 'state.lock', 'rollout', 'secrets.required']) {
      const check = find(report.checks, id);
      expect(check?.status).toBe('unknown');
      expect(check?.credential).toBe('scaleway');
    }
    // Public HTTP checks still evaluate, so nothing scaleway drives nextAction.
    expect(report.nextAction).toBeUndefined();
  });
});

describe('nextAction priority (lifecycle order)', () => {
  it('missing pulumi outranks everything', () => {
    const report = evaluateStatus(
      base({ tooling: { pulumi: false, dockerBuildx: true, gh: true }, stackState: 'fresh', projectId: undefined }),
    );
    expect(find(report.checks, 'tooling.pulumi')?.status).toBe('error');
    expect(report.nextAction?.command).toBe('brew install pulumi/tap/pulumi');
  });

  it('a fresh stack points at setup', () => {
    const report = evaluateStatus(
      base({
        stackState: 'fresh',
        projectId: undefined,
        stateBucketExists: false,
        rollout: undefined,
        requiredSecretsMissing: undefined,
        lock: undefined,
      }),
    );
    expect(report.nextAction?.command).toBe('pnpm infra');
    expect(find(report.checks, 'config.stackState')?.status).toBe('missing');
  });

  it('bootstrapped with nothing deployed points at deploy', () => {
    const report = evaluateStatus(base({ rollout: [], live: undefined }));
    expect(find(report.checks, 'rollout')?.status).toBe('missing');
    expect(report.nextAction?.command).toContain('deploy --mode staging');
  });

  it('an unset required secret outranks rollout/live', () => {
    const report = evaluateStatus(base({ requiredSecretsMissing: ['admin-email'] }));
    expect(find(report.checks, 'secrets.required')?.status).toBe('missing');
    expect(report.nextAction?.description).toContain('runtime secret');
  });
});

describe('live service checks', () => {
  it('serving the expected sha is ok', () => {
    expect(find(evaluateStatus(base()).checks, 'live.backend')?.status).toBe('ok');
  });

  it('serving a stale sha warns and points at deploy', () => {
    const report = evaluateStatus(
      base({
        live: [
          {
            slug: 'backend',
            healthUrl: 'https://api.example.com/health',
            probe: { status: 204, version: 'oldsha00' },
            expectedSha: 'abc123def456',
          },
        ],
      }),
    );
    const check = find(report.checks, 'live.backend');
    expect(check?.status).toBe('warn');
    expect(report.nextAction?.command).toContain('deploy --mode staging');
  });

  it('an unreachable service is missing', () => {
    const report = evaluateStatus(
      base({ live: [{ slug: 'backend', healthUrl: 'https://api.example.com/health', probe: { status: 0 } }] }),
    );
    expect(find(report.checks, 'live.backend')?.status).toBe('missing');
  });

  it('a service that was not probed is unknown', () => {
    const report = evaluateStatus(base({ live: [{ slug: 'backend', healthUrl: 'https://api.example.com/health' }] }));
    expect(find(report.checks, 'live.backend')?.status).toBe('unknown');
  });
});

describe('dns check', () => {
  it('resolving is ok', () => {
    expect(find(evaluateStatus(base()).checks, 'dns.zone')?.status).toBe('ok');
  });

  it('NXDOMAIN warns', () => {
    const report = evaluateStatus(base({ dns: { host: 'app.example.com', resolvedIps: [] } }));
    expect(find(report.checks, 'dns.zone')?.status).toBe('warn');
  });

  it('is omitted when the app has no domain', () => {
    const report = evaluateStatus(base({ hasDomain: false, dns: undefined }));
    expect(find(report.checks, 'dns.zone')).toBeUndefined();
  });
});

describe('stack lock', () => {
  it('a stale lock warns and points at unlock', () => {
    const report = evaluateStatus(
      base({
        lock: { held: true, owner: 'ci:run-5', operation: 'deploy', expiresAt: '2020-01-01T00:00:00Z', stale: true },
      }),
    );
    const check = find(report.checks, 'state.lock');
    expect(check?.status).toBe('warn');
    expect(check?.nextAction?.description).toContain('Unlock');
  });

  it('a live lock warns without an action (a run may be in progress)', () => {
    const report = evaluateStatus(
      base({
        lock: { held: true, owner: 'ci:run-5', operation: 'deploy', expiresAt: '2999-01-01T00:00:00Z', stale: false },
      }),
    );
    const check = find(report.checks, 'state.lock');
    expect(check?.status).toBe('warn');
    expect(check?.nextAction).toBeUndefined();
  });
});
