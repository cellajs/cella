import { describe, expect, it } from 'vitest';
import { policyAdmits } from './admit-operator-buckets';

const policy = (principals: string[]) =>
  JSON.stringify({ Version: '2023-04-17', Statement: principals.map((id) => ({ Effect: 'Allow', Principal: { SCW: `application_id:${id}` } })) });

describe('policyAdmits', () => {
  it('finds the application among the principals', () => {
    expect(policyAdmits(policy(['ci', 'operator']), 'operator')).toBe(true);
  });

  it('is false for a policy without it, and for no policy at all', () => {
    expect(policyAdmits(policy(['ci', 'admin']), 'operator')).toBe(false);
    expect(policyAdmits(undefined, 'operator')).toBe(false);
  });
});
