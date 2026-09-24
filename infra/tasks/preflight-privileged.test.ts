import { describe, expect, it } from 'vitest';
import {
  applyHint,
  classifyPreviewSteps,
  formatPending,
  isPrivilegedUrn,
  readPath,
  splitUrn,
} from './preflight-privileged';

const urn = (type: string, name: string) => `urn:pulumi:production::infra::${type}::${name}`;

describe('isPrivilegedUrn', () => {
  it('flags database, IAM, VPC and private-network resources and the state bucket policy', () => {
    expect(isPrivilegedUrn(urn('scaleway:databases/privilege:Privilege', 'admin-cron-privilege'))).toBe(true);
    expect(isPrivilegedUrn(urn('scaleway:iam/policy:Policy', 'vm-backend-policy'))).toBe(true);
    expect(isPrivilegedUrn(urn('scaleway:network/vpc:Vpc', 'main-vpc'))).toBe(true);
    expect(isPrivilegedUrn(urn('scaleway:network/privateNetwork:PrivateNetwork', 'main-pn'))).toBe(true);
    expect(isPrivilegedUrn(urn('scaleway:object/bucketPolicy:BucketPolicy', 'state-bucket-policy'))).toBe(true);
  });
  it('leaves compute, load balancer, storage and secrets to the CI deploy', () => {
    expect(isPrivilegedUrn(urn('scaleway:instance/server:Server', 'vm-backend-e67a0456e8'))).toBe(false);
    expect(isPrivilegedUrn(urn('scaleway:loadbalancers/backend:Backend', 'backend'))).toBe(false);
    expect(isPrivilegedUrn(urn('scaleway:object/bucketPolicy:BucketPolicy', 'frontend-bucket-policy'))).toBe(false);
    expect(isPrivilegedUrn(urn('scaleway:secrets/version:Version', 'x'))).toBe(false);
  });
  it('splits a URN into type and name', () => {
    expect(splitUrn(urn('scaleway:iam/policy:Policy', 'vm-backend-policy'))).toEqual({
      type: 'scaleway:iam/policy:Policy',
      name: 'vm-backend-policy',
    });
  });
});

describe('classifyPreviewSteps', () => {
  it('lists pending privileged mutations with their changed paths and counts the rest', () => {
    const { privileged, ciApplicable } = classifyPreviewSteps([
      { op: 'same', urn: urn('scaleway:iam/policy:Policy', 'vm-boot-policy') },
      { op: 'create', urn: urn('scaleway:databases/privilege:Privilege', 'admin-cron-privilege') },
      {
        op: 'update',
        urn: urn('scaleway:iam/policy:Policy', 'vm-backend-policy'),
        detailedDiff: { 'rules[0].condition': { kind: 'update' } },
      },
      { op: 'create', urn: urn('scaleway:instance/server:Server', 'vm-backend-abc') },
      { op: 'delete', urn: urn('scaleway:instance/server:Server', 'vm-backend-old') },
    ]);
    expect(privileged).toEqual([
      { op: 'create', resource: 'scaleway:databases/privilege:Privilege::admin-cron-privilege', paths: [] },
      { op: 'update', resource: 'scaleway:iam/policy:Policy::vm-backend-policy', paths: ['rules[0].condition'] },
    ]);
    expect(ciApplicable).toBe(2);
  });
  it('shows old and new values for IAM policy rule paths, from state outputs and program inputs', () => {
    const { privileged } = classifyPreviewSteps([
      {
        op: 'update',
        urn: urn('scaleway:iam/policy:Policy', 'vm-backend-policy'),
        detailedDiff: { 'rules[0].condition': { kind: 'update' } },
        oldState: { outputs: { rules: [{ condition: 'a || b' }] } },
        newState: { inputs: { rules: [{ condition: 'a || b || c' }] } },
      },
      {
        op: 'update',
        urn: urn('scaleway:databases/privilege:Privilege', 'p'),
        detailedDiff: { permission: { kind: 'update' } },
        oldState: { outputs: { permission: 'readonly' } },
        newState: { inputs: { permission: 'all' } },
      },
    ]);
    expect(privileged[0]?.values).toEqual([{ path: 'rules[0].condition', old: 'a || b', new: 'a || b || c' }]);
    expect(privileged[1]?.values).toBeUndefined();
    const text = formatPending('production', privileged);
    expect(text).toContain('rules[0].condition: a || b → a || b || c');
    expect(text).not.toContain('readonly');
  });
  it('reads bracketed paths and tolerates missing segments', () => {
    expect(readPath({ rules: [{ condition: 'x' }] }, 'rules[0].condition')).toBe('x');
    expect(readPath({ rules: [] }, 'rules[0].condition')).toBeUndefined();
    expect(readPath(undefined, 'rules[0].condition')).toBeUndefined();
    expect(readPath({ a: { b: [[1, 2]] } }, 'a.b[0][1]')).toBe(2);
  });
  it('formats the operator command with the mode', () => {
    const text = formatPending('production', [
      { op: 'create', resource: 'scaleway:databases/privilege:Privilege::p', paths: [] },
    ]);
    expect(text).toContain('1 privileged change(s) pending');
    expect(text).toContain(applyHint('production'));
    expect(applyHint('staging')).toBe('pnpm infra --mode staging  →  Stack setup  →  Apply infra change');
  });
});
