import { describe, expect, it } from 'vitest';
import { refusedOnIam } from './privileged-converge';

describe('refusedOnIam', () => {
  it('recognises a refused write of a policy, an application or a key', () => {
    expect(refusedOnIam('error: scaleway-sdk-go: insufficient permissions: write iam_policy')).toBe(true);
    expect(refusedOnIam('insufficient permissions: write application')).toBe(true);
    expect(refusedOnIam('insufficient permissions: write api_key')).toBe(true);
  });

  it('must not send an operator to the Owner path for a refusal that is not about IAM', () => {
    expect(refusedOnIam('insufficient permissions: write rdb_instance')).toBe(false);
    expect(refusedOnIam('error: timeout while waiting for state')).toBe(false);
  });
});
