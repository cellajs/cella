import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { formatQuickFacts, type QuickFacts } from './status';

const strip = (lines: string[]) => lines.map((line) => stripVTControlCharacters(line));
const T = Date.parse('2026-09-24T12:00:00Z');

const adminKey = {
  accessKey: 'SCWADMIN',
  bearer: 'application' as const,
  name: 'cella-production-admin',
  bearerId: 'a',
};

describe('formatQuickFacts', () => {
  it('reports a free lock, the live rollout and a healthy admin key', () => {
    const facts: QuickFacts = {
      control: {
        schemaVersion: 2,
        bootstrap: {},
        rollout: { backend: { active: { id: 'e67a', sha: '117397c20f0dd', seq: 12 }, seq: 12 } },
        updatedAt: '2026-09-23T21:37:29.000Z',
        updatedBy: 'ci:run-590',
      },
      key: { desc: adminKey, role: 'admin', slot: 'admin' },
      unavailable: [],
    };
    expect(strip(formatQuickFacts(facts, { now: T }))).toEqual([
      '● Lock: free',
      '● Live: backend 117397c (updated 2026-09-23 21:37 UTC by ci:run-590)',
      '● Admin application key: SCWADMIN → cella-production-admin (admin application)',
    ]);
  });

  it('warns about a held lock, a CI key in the admin slot and an imminent expiry', () => {
    const facts: QuickFacts = {
      lock: {
        owner: 'operator:flip',
        operation: 'apply',
        acquiredAt: '2026-09-24T11:50:00.000Z',
        expiresAt: '2026-09-24T12:03:00.000Z',
      },
      key: {
        desc: {
          accessKey: 'SCWCI',
          bearer: 'application',
          name: 'cella-production-ci-deploy',
          bearerId: 'c',
          expiresAt: '2026-09-24T14:00:00Z',
        },
        role: 'ci-deploy',
        slot: 'admin',
      },
      unavailable: ['key lookup'],
    };
    const lines = strip(formatQuickFacts(facts, { now: T }));
    expect(lines[0]).toBe('● Lock: held by operator:flip (apply, since 2026-09-24 11:50:00 UTC)');
    expect(lines[1]).toBe(
      '⚠ Admin application key: SCWCI → cella-production-ci-deploy (CI deploy application, expires 2026-09-24 14:00 UTC) — expires in 2h',
    );
    expect(lines[2]).toContain('Fetch admin application key');
    expect(lines[3]).toContain('key lookup: no answer');
  });

  it('points at the fetch action when no key is configured at all', () => {
    const lines = strip(formatQuickFacts({ unavailable: [] }, { now: T, configured: 'none' }));
    expect(lines).toEqual([
      '● Lock: free',
      '⚠ Admin application key: none in infra/.env.<mode> (SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY; Manage keys & secrets → Fetch admin application key)',
    ]);
  });

  it('names an ambient SCW_* pair as such and says CLI actions do not use it', () => {
    const lines = strip(
      formatQuickFacts(
        {
          key: {
            desc: { ...adminKey, accessKey: 'SCWCI', name: 'cella-production-ci-deploy' },
            role: 'ci-deploy',
            slot: 'ambient',
          },
          unavailable: [],
        },
        { now: T, configured: 'ambient' },
      ),
    );
    expect(lines[1]).toBe('⚠ Ambient key: SCW_ACCESS_KEY SCWCI → cella-production-ci-deploy (CI deploy application)');
    expect(lines[2]).toContain('CLI actions do not use');
  });
});
