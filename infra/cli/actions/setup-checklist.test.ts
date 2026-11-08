import { describe, expect, it } from 'vitest';
import { type ChecklistFacts, checklistRows } from './setup-checklist';

/** A production stack with every step done. */
const ready: ChecklistFacts = {
  pulumi: '3.273.0',
  dockerBuildx: true,
  repository: 'https://github.com/sam/plantly.git',
  domain: 'plantly.app',
  hasCiKey: true,
  stackState: 'bootstrapped',
  firstProvisioning: false,
  stackFile: 'pushed',
  releaseTag: '0.1.0',
  adminEmailSet: true,
  mode: 'production',
};

const doneOf = (facts: Partial<ChecklistFacts>, title: string) => checklistRows({ ...ready, ...facts }).find((row) => row.title === title)?.done;

describe('checklistRows', () => {
  it.each<[string, Partial<ChecklistFacts>, boolean | undefined]>([
    ['Tools', {}, true],
    ['Tools', { pulumi: undefined }, false],
    ['Tools', { dockerBuildx: false }, false],
    ['Repository', { repository: undefined }, false],
    ['Domain', { domain: '' }, false],
    ['Sign in', { hasCiKey: false }, false],
    ['Create', { stackState: 'partial' }, false],
    ['Create', { firstProvisioning: true }, false],
    ['Connect', { stackFile: 'committed' }, false],
    ['Connect', { stackFile: 'untracked' }, false],
    ['Connect', { stackFile: 'missing' }, false],
    ['First release', { releaseTag: undefined }, false],
    ['First release', { mode: 'staging' }, false],
    ['First release', { mode: 'staging', releaseTag: undefined, environmentsTarget: 'branch:main' }, true],
    ['First admin', { adminEmailSet: false }, false],
    ['First admin', { adminEmailSet: undefined }, undefined],
    ['First admin', { stackState: 'partial', adminEmailSet: true }, undefined],
    ['First admin', { firstProvisioning: true, adminEmailSet: false }, undefined],
  ])('%s with %o is done: %s', (title, facts, done) => {
    expect(doneOf(facts, title)).toBe(done);
  });

  it('marks the first row not done as now, and only that one', () => {
    const rows = checklistRows({ ...ready, hasCiKey: false, stackState: 'fresh', stackFile: 'missing', releaseTag: undefined });
    expect(rows.filter((row) => row.now).map((row) => row.title)).toEqual(['Sign in']);
  });

  it('marks no row now when every step is done, nor a row whose fact is unknown', () => {
    expect(checklistRows(ready).some((row) => row.now)).toBe(false);
    expect(checklistRows({ ...ready, adminEmailSet: undefined }).some((row) => row.now)).toBe(false);
  });
});
