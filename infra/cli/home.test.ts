import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { Check, StatusReport } from '../lib/status/types';
import { formatHome, type HomeFacts, upNextOf } from './home';

const plain = (lines: string[]) => lines.map((line) => stripVTControlCharacters(line).replace(/\s+$/, ''));

const ok = (id: string, title: string, detail: string, subject?: string): Check => ({
  id,
  title,
  status: 'ok',
  detail,
  key: 'scaleway',
  ...(subject ? { subject } : {}),
});

function report(checks: Check[], nextAction?: StatusReport['nextAction']): StatusReport {
  return {
    mode: 'production',
    generatedAt: '2026-11-08T10:00:00Z',
    stackState: 'bootstrapped',
    checks,
    nextAction,
    summary: { ok: 0, warn: 0, missing: 0, unknown: 0, error: 0 },
  };
}

const refs = [
  { sha: 'c19588d491aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ref: 'refs/tags/0.34.0' },
  { sha: 'a6696b654eaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ref: 'refs/tags/0.35.0' },
  { sha: '4be21c0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ref: 'refs/heads/main' },
];

const healthy: HomeFacts = {
  keyConfigured: true,
  refs,
  live: {
    schemaVersion: 1,
    roles: { backend: { slot: 'b', machine: 'm1', commit: 'c19588d', retry: 0, rotation: 2 } },
    updatedAt: '2026-11-02T15:53:00Z',
  },
  report: report([
    ok('inventory.applications', 'Applications', 'only the declared ones'),
    ok('identity.keyAges', 'Key ages', 'fine'),
    ok('runs.last', 'Last deploy', 'deployed c19588d491', 'c19588d491aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ok('live.backend', 'Service backend', 'serving c19588d'),
    ok('live.frontend', 'Service frontend', 'serving c19588d'),
    ok('live.components', 'Primary components', 'all healthy'),
    ok('db.publicEndpoint', 'DB public endpoint', 'private only'),
    ok('state.lock', 'Lease', 'free'),
  ]),
};

describe('formatHome', () => {
  it('names the release that serves, counts the healthy services and shows nothing else when every check passes', () => {
    expect(plain(formatHome(healthy))).toEqual(['✓ Live         0.34.0 since Nov 2 · 2 services healthy · all checks pass']);
  });

  it('shows only what needs a person: the failed deploy beside what keeps serving, the findings by what they found, the lease', () => {
    const facts: HomeFacts = {
      ...healthy,
      jobRuns: [
        { id: '1', state: 'failed', created_at: '2026-11-08T09:50:00Z' },
        { id: '2', state: 'failed', created_at: '2026-11-08T08:34:00Z' },
        { id: '3', state: 'failed', created_at: '2026-11-01T08:34:00Z' },
      ],
      report: report(
        [
          {
            ...ok('inventory.applications', 'Applications', ''),
            status: 'error',
            detail: '…',
            headline: '4 outside applications can act on production',
          },
          { ...ok('inventory.keys', 'API keys', ''), status: 'error', detail: '…', headline: '2 operator keys outlive a day' },
          ok('identity.keyAges', 'Key ages', 'fine'),
          {
            ...ok('runs.last', 'Last deploy', '', 'a6696b654eaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
            status: 'error',
            detail: 'a6696b654e failed at "Switch machines": the new backend machine crashed at boot',
            headline: 'a6696b654e failed at "Switch machines"',
            at: '2026-11-08T09:00:00Z',
          },
          { ...ok('live.backend', 'Service backend', ''), status: 'missing', detail: 'unreachable' },
          ok('live.frontend', 'Service frontend', 'serving c19588d'),
          ok('db.publicEndpoint', 'DB public endpoint', 'private only'),
          { ...ok('state.lock', 'Lease', ''), status: 'warn', detail: 'held by job:a6696b654e' },
        ],
        { description: 'Read how it ended', command: 'pnpm infra runs' },
      ),
    };
    expect(plain(formatHome(facts, { now: Date.parse('2026-11-08T10:00:00Z') }))).toEqual([
      '✗ Live         0.34.0 since Nov 2 · 1 of 2 services unhealthy',
      '✗ Last deploy  0.35.0 failed at "Switch machines" an hour ago · 0.34.0 keeps serving',
      '               2 failed runs today',
      '⚠ Security     4 outside applications can act on production · 2 operator keys outlive a day',
      '⚠ Lease        held by job:a6696b654e',
    ]);
  });

  it('says when nothing was read for lack of a key, and renders nothing before the setup is done', () => {
    expect(plain(formatHome({ ...healthy, keyConfigured: false }))).toEqual([
      '? Live         not read',
      '⚠ Not read     this machine has no observer key: "More → Update identities" puts one here',
    ]);
    expect(formatHome({ ...healthy, report: { ...healthy.report, stackState: 'partial' } })).toEqual([]);
  });

  it('names a commit no tag points at by its branch, and one role per line when the roles differ', () => {
    const facts: HomeFacts = {
      ...healthy,
      live: {
        schemaVersion: 1,
        roles: {
          backend: { slot: 'a', machine: 'm1', commit: '4be21c0', retry: 0, rotation: 0 },
          frontend: { slot: 'b', machine: 'm2', commit: 'deadbee', retry: 0, rotation: 0 },
        },
      },
    };
    expect(plain(formatHome(facts))[0]).toBe('✓ Live         backend main@4be21c0, frontend deadbee · 2 services healthy');
  });
});

describe('upNextOf', () => {
  it('maps a next action to the menu action its command names, and nothing else', () => {
    expect(upNextOf(report([], { description: 'Read how it ended', command: 'pnpm infra runs --mode production' }))).toEqual({
      action: 'runs',
      description: 'Read how it ended',
    });
    expect(upNextOf(report([], { description: 'Do it by hand', command: 'scw rdb ...' }))).toBeUndefined();
    expect(upNextOf(report([]))).toBeUndefined();
  });

  it('names the deploy by its release: one under way to follow, a failed one to read the boot log of', () => {
    const deploying = report([ok('runs.last', 'Last deploy', 'a6696b654e is deploying', 'a6696b654eaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')]);
    expect(upNextOf(deploying, refs)).toEqual({ action: 'start-deploy', description: 'Follow the deploy of 0.35.0' });
    const failed = report([{ ...deploying.checks[0]!, status: 'error', detail: 'a6696b654e failed' }], {
      description: 'Read how it ended',
      command: 'pnpm infra runs',
    });
    expect(upNextOf(failed, refs)).toEqual({ action: 'runs', description: 'Read the boot log of 0.35.0' });
  });

  it('sends a person to the full status when only the security checks found something', () => {
    const findings = report([{ ...ok('inventory.keys', 'API keys', ''), status: 'error', detail: 'a durable key' }]);
    expect(upNextOf(findings)).toEqual({ action: 'status', description: 'Review the security finding' });
  });
});
