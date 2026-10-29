import { describe, expect, it } from 'vitest';
import { machineKeyDescription, machineKeyStep, machinePrincipals, standingAccessKey } from './machine-keys';

const principal = { principal: 'cdc', application: 'app-production-vm-cdc' };

describe('machine keys', () => {
  it('has one identity per registry service, wherever it runs, and the builder', () => {
    const principals = machinePrincipals('app', 'production');
    expect(principals.at(-1)).toEqual({ principal: 'builder', application: 'app-production-builder' });
    expect(principals.map((entry) => entry.principal)).toContain('backend');
  });

  it('reads the access key back from the description it wrote, and nothing from another', () => {
    expect(standingAccessKey(machineKeyDescription('app-production-vm-cdc', 'SCWABCDEF0123456789X'))).toBe('SCWABCDEF0123456789X');
    expect(standingAccessKey('Seeded by hand')).toBeUndefined();
    expect(standingAccessKey(undefined)).toBeUndefined();
  });

  it('makes a key when none is stored, or the stored one is no longer live', () => {
    expect(machineKeyStep(principal, undefined, ['SCWOLD']).change).toBe('make');
    expect(machineKeyStep(principal, 'SCWGONE', ['SCWOLD'])).toMatchObject({ change: 'make', extra: ['SCWOLD'] });
  });

  it('must not leave a key beside the standing one: no machine holds it, so nobody watches it', () => {
    expect(machineKeyStep(principal, 'SCWSTAND', ['SCWSTAND', 'SCWPLANTED'])).toMatchObject({ change: 'prune', extra: ['SCWPLANTED'] });
    expect(machineKeyStep(principal, 'SCWSTAND', ['SCWSTAND'])).toMatchObject({ change: 'none', extra: [] });
  });
});
