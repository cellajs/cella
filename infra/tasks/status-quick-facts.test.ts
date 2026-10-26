import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { formatQuickFacts, type QuickFacts, rotationLine } from './status';

const strip = (lines: string[]) => lines.map((line) => stripVTControlCharacters(line));
const T = Date.parse('2026-09-24T12:00:00Z');

const observerKey = { accessKey: 'SCWOBS', bearer: 'application' as const, name: 'cella-observer', bearerId: 'o' };

describe('formatQuickFacts', () => {
  it('reports a free lock, the live rollout and a healthy observer key', () => {
    const facts: QuickFacts = {
      control: {
        schemaVersion: 2,
        bootstrap: {},
        rollout: { backend: { active: { id: 'e67a', sha: '117397c20f0dd', seq: 12 }, seq: 12 } },
        updatedAt: '2026-09-23T21:37:29.000Z',
        updatedBy: 'ci:run-590',
      },
      key: { desc: observerKey, role: 'observer', slot: 'observer' },
      unavailable: [],
    };
    expect(strip(formatQuickFacts(facts, { now: T }))).toEqual([
      '● Lock: free',
      '● Live: backend 117397c (updated 2026-09-23 21:37 UTC by ci:run-590)',
      '● Last rotation: keys never, secrets never',
      '● Observer key: SCWOBS → cella-observer (observer application)',
    ]);
  });

  it('warns about a held lock, a CI key in the observer slot and an imminent expiry', () => {
    const facts: QuickFacts = {
      lock: { owner: 'operator:flip', operation: 'apply', acquiredAt: '2026-09-24T11:50:00.000Z', expiresAt: '2026-09-24T12:03:00.000Z' },
      key: {
        desc: { accessKey: 'SCWCI', bearer: 'application', name: 'cella-production-ci-deploy', bearerId: 'c', expiresAt: '2026-09-24T14:00:00Z' },
        role: 'ci-deploy',
        slot: 'observer',
      },
      unavailable: ['key lookup'],
    };
    const lines = strip(formatQuickFacts(facts, { now: T }));
    expect(lines[0]).toBe('● Lock: held by operator:flip (apply, since 2026-09-24 11:50:00 UTC)');
    expect(lines[1]).toBe('⚠ Observer key: SCWCI → cella-production-ci-deploy (CI deploy application, expires 2026-09-24 14:00 UTC) — expires in 2h');
    expect(lines[2]).toContain('Update identities puts it on this machine');
    expect(lines[3]).toContain('key lookup: no answer');
  });

  it('points at the identity action when no key is configured at all, and claims nothing about a lock it could not read', () => {
    const lines = strip(formatQuickFacts({ unavailable: [] }, { now: T, configured: 'none' }));
    expect(lines).toEqual([
      '⚠ Observer key: none in infra/.env.<mode> (SCW_OBSERVER_ACCESS_KEY / SCW_OBSERVER_SECRET_KEY; Update identities puts it on this machine)',
    ]);
  });

  it('names the application whose key the observer slot expects when the caller knows it', () => {
    const lines = strip(formatQuickFacts({ unavailable: [] }, { now: T, configured: 'none', observerApplication: 'cella-observer' }));
    expect(lines[0]).toContain("Observer key ('cella-observer'): none in infra/.env.<mode>");
  });

  it('names an ambient SCW_* pair as such and says CLI actions do not use it', () => {
    const lines = strip(
      formatQuickFacts(
        {
          key: { desc: { ...observerKey, accessKey: 'SCWCI', name: 'cella-production-ci-deploy' }, role: 'ci-deploy', slot: 'ambient' },
          unavailable: [],
        },
        { now: T, configured: 'ambient' },
      ),
    );
    expect(lines[1]).toBe('⚠ Ambient key: SCW_ACCESS_KEY SCWCI → cella-production-ci-deploy (CI deploy application)');
    expect(lines[2]).toContain('CLI actions do not use');
  });
});

describe('rotationLine', () => {
  it('says when each kind was last rotated, and never where it was not', () => {
    expect(rotationLine({ counter: 2, keys: { at: '2026-10-14T09:00:00.000Z', by: 'operator:flip' } })).toBe(
      'Last rotation: keys 2026-10-14 by operator:flip, secrets never',
    );
  });
});
