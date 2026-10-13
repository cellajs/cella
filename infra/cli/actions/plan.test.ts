import { describe, expect, it } from 'vitest';
import { pulumiUpArgs } from '../../lib/stack/pulumi-up';
import { planArgs } from './plan';

describe('planArgs', () => {
  it('is a diff of the stack refreshed against live state', () => {
    expect(planArgs('organization/infra/production')).toEqual(['preview', '--stack', 'organization/infra/production', '--diff', '--refresh']);
  });

  it('plans the overlay config when the run converges one', () => {
    expect(planArgs('s', '/tmp/overlay.yaml')).toEqual(['preview', '--stack', 's', '--diff', '--refresh', '--config-file', '/tmp/overlay.yaml']);
  });

  it('must not show a plan the up does not carry out: both refresh, or the up would skip the drift the operator confirmed', () => {
    expect(planArgs('s')).toContain('--refresh');
    expect(pulumiUpArgs('s', { skipPreview: true, refresh: true })).toContain('--refresh');
  });
});
