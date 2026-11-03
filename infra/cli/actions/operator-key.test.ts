import { describe, expect, it } from 'vitest';
import { operatorReach } from './operator-key';

describe('operatorReach', () => {
  it('reaches the environment the action runs for, then every other one that has a project', () => {
    expect(operatorReach('staging', 'p-staging', new Map([['p-production', 'production']]))).toEqual([
      { mode: 'staging', projectId: 'p-staging' },
      { mode: 'production', projectId: 'p-production' },
    ]);
  });

  it('is one environment when no other has a project on this machine', () => {
    expect(operatorReach('production', 'p-production', new Map())).toEqual([{ mode: 'production', projectId: 'p-production' }]);
  });

  it('names a shared project once', () => {
    expect(operatorReach('staging', 'p-one', new Map([['p-one', 'production']]))).toEqual([{ mode: 'staging', projectId: 'p-one' }]);
  });
});
