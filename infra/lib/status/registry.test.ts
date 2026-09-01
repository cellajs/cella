import { describe, expect, it } from 'vitest';
import type { GithubFacts } from './providers/github';
import type { LiveServiceFact } from './providers/live';
import type { IdentityFacts } from './providers/stack';
import type { StoreValidationFact } from './providers/stores';
import type { ToolingFacts } from './providers/tooling';
import { assembleReport, statusProviders } from './registry';
import type { Check, ProbeSession, ScalewayFacts } from './types';

/**
 * Port of the pre-registry evaluate.test.ts: the same assertions, driven by
 * per-provider facts. `reportFor` evaluates every registered provider against
 * the given facts, exactly what buildStatusReport does after its gather phase.
 */

interface Facts {
  tooling?: ToolingFacts;
  identity?: IdentityFacts;
  github?: GithubFacts;
  state?: ScalewayFacts;
  secrets?: string[];
  live?: LiveServiceFact[];
  dns?: { host: string; resolvedIps?: string[] };
  stores?: StoreValidationFact[];
}

/** A fully-healthy bootstrapped staging stack; override per test. */
function base(overrides: Partial<Facts> = {}): Facts {
  return {
    tooling: { pulumi: true, dockerBuildx: true, gh: true },
    identity: { adminAppId: 'app-1' },
    github: { authenticated: true, repo: 'org/repo', environmentExists: true, missingSecrets: [] },
    state: {
      stateBucketExists: true,
      lock: { held: false },
      rollout: [
        { slug: 'backend', activeSha: 'abc123def456' },
        { slug: 'frontend', activeSha: 'abc123def456' },
      ],
    },
    secrets: [],
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
    stores: [{ id: 'primary', kind: 'postgres-managed' }],
    ...overrides,
  };
}

function session(overrides: Partial<ProbeSession> = {}): ProbeSession {
  return {
    mode: 'staging',
    appConfig: {} as ProbeSession['appConfig'],
    stackState: 'bootstrapped',
    projectId: 'proj-1',
    credentialsAvailable: true,
    hasDomain: true,
    scalewayFacts: async () => ({}),
    ...overrides,
  };
}

function reportFor(facts: Facts, sessionOverrides: Partial<ProbeSession> = {}) {
  const s = session(sessionOverrides);
  const factsByDomain: Record<string, unknown> = {
    tooling: facts.tooling,
    config: {},
    identity: facts.identity,
    github: facts.github,
    state: facts.state,
    secrets: facts.secrets,
    live: facts.live,
    dns: facts.dns,
    stores: facts.stores,
  };
  const checks = statusProviders.flatMap((provider) => provider.evaluate(factsByDomain[provider.domain] as never, s));
  return assembleReport(s, checks);
}

const find = (checks: Check[], id: string): Check | undefined => checks.find((c) => c.id === id);

describe('report envelope (public contract)', () => {
  it('has the documented top-level shape and schema version', () => {
    const report = reportFor(base());
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
    const report = reportFor(base());
    expect(Object.keys(report.summary).sort()).toEqual(['error', 'missing', 'ok', 'unknown', 'warn']);
    const total = Object.values(report.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.checks.length);
  });

  it('every check carries id, title, status, detail, credential', () => {
    for (const check of reportFor(base()).checks) {
      expect(check.id).toBeTruthy();
      expect(check.title).toBeTruthy();
      expect(['ok', 'warn', 'missing', 'unknown', 'error']).toContain(check.status);
      expect(['none', 'scaleway']).toContain(check.credential);
    }
  });

  it('a healthy stack is all-ok with no next action', () => {
    const report = reportFor(base());
    expect(report.nextAction).toBeUndefined();
    expect(report.summary.ok).toBe(report.checks.length);
  });
});

describe('credential degradation', () => {
  it('scaleway-tier checks are unknown (not error) without credentials', () => {
    const report = reportFor(base({ state: {}, secrets: undefined, identity: undefined }), {
      credentialsAvailable: false,
    });
    for (const id of ['identity.adminApp', 'state.bucket', 'state.lock', 'rollout', 'secrets.required']) {
      const check = find(report.checks, id);
      expect(check?.status).toBe('unknown');
      expect(check?.credential).toBe('scaleway');
    }
    // Public HTTP checks still evaluate, so nothing scaleway drives nextAction.
    expect(report.nextAction).toBeUndefined();
  });
});

describe('admin app identity', () => {
  it('reports the id resolved from IAM by name', () => {
    expect(find(reportFor(base()).checks, 'identity.adminApp')?.status).toBe('ok');
  });

  it('warns and points at setup when the application does not exist', () => {
    const check = find(reportFor(base({ identity: { adminAppId: null } })).checks, 'identity.adminApp');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('not found');
    expect(check?.nextAction?.command).toBe('pnpm infra');
  });

  it('is unknown, not a warning, when the IAM probe could not run', () => {
    const check = find(reportFor(base({ identity: undefined })).checks, 'identity.adminApp');
    expect(check?.status).toBe('unknown');
  });

  it('is absent on a stack that has not been bootstrapped', () => {
    const report = reportFor(base({ identity: undefined }), { stackState: 'fresh' });
    expect(find(report.checks, 'identity.adminApp')).toBeUndefined();
  });
});

describe('nextAction priority (lifecycle order)', () => {
  it('missing pulumi outranks everything', () => {
    const report = reportFor(base({ tooling: { pulumi: false, dockerBuildx: true, gh: true } }), {
      stackState: 'fresh',
      projectId: undefined,
    });
    expect(find(report.checks, 'tooling.pulumi')?.status).toBe('error');
    expect(report.nextAction?.command).toBe('brew install pulumi/tap/pulumi');
  });

  it('a fresh stack points at setup', () => {
    const report = reportFor(base({ state: { stateBucketExists: false }, secrets: undefined, live: undefined }), {
      stackState: 'fresh',
      projectId: undefined,
    });
    expect(report.nextAction?.command).toBe('pnpm infra');
    expect(find(report.checks, 'config.stackState')?.status).toBe('missing');
  });

  it('bootstrapped with nothing deployed points at deploy', () => {
    const report = reportFor(
      base({ state: { stateBucketExists: true, lock: { held: false }, rollout: [] }, live: undefined }),
    );
    expect(find(report.checks, 'rollout')?.status).toBe('missing');
    expect(report.nextAction?.command).toContain('deploy --mode staging');
  });

  it('an unset required secret outranks rollout/live', () => {
    const report = reportFor(base({ secrets: ['admin-email'] }));
    expect(find(report.checks, 'secrets.required')?.status).toBe('missing');
    expect(report.nextAction?.description).toContain('runtime secret');
  });

  it('a store misconfiguration outranks deploy-stage actions', () => {
    const report = reportFor(
      base({ stores: [{ id: 'primary', kind: 'redis-managed', error: 'tls is disabled' }], secrets: ['x'] }),
    );
    const check = find(report.checks, 'stores.primary');
    expect(check?.status).toBe('error');
    expect(check?.detail).toBe('tls is disabled');
  });
});

describe('live service checks', () => {
  it('serving the expected sha is ok', () => {
    expect(find(reportFor(base()).checks, 'live.backend')?.status).toBe('ok');
  });

  it('serving a stale sha warns and points at deploy', () => {
    const report = reportFor(
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
    const report = reportFor(
      base({ live: [{ slug: 'backend', healthUrl: 'https://api.example.com/health', probe: { status: 0 } }] }),
    );
    expect(find(report.checks, 'live.backend')?.status).toBe('missing');
  });

  it('a service that was not probed is unknown', () => {
    const report = reportFor(base({ live: [{ slug: 'backend', healthUrl: 'https://api.example.com/health' }] }));
    expect(find(report.checks, 'live.backend')?.status).toBe('unknown');
  });
});

describe('dns check', () => {
  it('resolving is ok', () => {
    expect(find(reportFor(base()).checks, 'dns.zone')?.status).toBe('ok');
  });

  it('NXDOMAIN warns', () => {
    const report = reportFor(base({ dns: { host: 'app.example.com', resolvedIps: [] } }));
    expect(find(report.checks, 'dns.zone')?.status).toBe('warn');
  });

  it('is omitted when the app has no domain', () => {
    const report = reportFor(base({ dns: undefined }), { hasDomain: false });
    expect(find(report.checks, 'dns.zone')).toBeUndefined();
  });
});

describe('stack lock', () => {
  it('a stale lock warns and points at unlock', () => {
    const report = reportFor(
      base({
        state: {
          stateBucketExists: true,
          lock: { held: true, owner: 'ci:run-5', operation: 'deploy', expiresAt: '2020-01-01T00:00:00Z', stale: true },
          rollout: [{ slug: 'backend', activeSha: 'abc123def456' }],
        },
      }),
    );
    const check = find(report.checks, 'state.lock');
    expect(check?.status).toBe('warn');
    expect(check?.nextAction?.description).toContain('Unlock');
  });

  it('a live lock warns without an action (a run may be in progress)', () => {
    const report = reportFor(
      base({
        state: {
          stateBucketExists: true,
          lock: { held: true, owner: 'ci:run-5', operation: 'deploy', expiresAt: '2999-01-01T00:00:00Z', stale: false },
          rollout: [{ slug: 'backend', activeSha: 'abc123def456' }],
        },
      }),
    );
    const check = find(report.checks, 'state.lock');
    expect(check?.status).toBe('warn');
    expect(check?.nextAction).toBeUndefined();
  });
});
