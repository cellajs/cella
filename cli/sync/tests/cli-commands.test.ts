import { describe, it, expect } from 'vitest';
import {
  validateBranchName,
  validateSyncService,
  validateLocation,
  validateRemoteName
} from '../src/modules/cli/commands';
import { InvalidArgumentError } from 'commander';

describe('validateBranchName', () => {
  it('should accept valid branch names', () => {
    expect(validateBranchName('main')).toBe('main');
    expect(validateBranchName('development')).toBe('development');
    expect(validateBranchName('feature/my-feature')).toBe('feature/my-feature');
    expect(validateBranchName('fix-123')).toBe('fix-123');
  });

  it('should trim whitespace', () => {
    expect(validateBranchName('  main  ')).toBe('main');
  });

  it('should reject invalid branch names', () => {
    expect(() => validateBranchName('')).toThrow(InvalidArgumentError);
    expect(() => validateBranchName('/invalid')).toThrow(InvalidArgumentError);
    expect(() => validateBranchName('invalid/')).toThrow(InvalidArgumentError);
  });
});

describe('validateSyncService', () => {
  it('should accept valid sync services', () => {
    expect(validateSyncService('boilerplate-fork')).toBe('boilerplate-fork');
    expect(validateSyncService('packages')).toBe('packages');
    expect(validateSyncService('diverged')).toBe('diverged');
    expect(validateSyncService('analyze')).toBe('analyze');
  });

  it('should trim whitespace', () => {
    expect(validateSyncService('  analyze  ')).toBe('analyze');
  });

  it('should reject invalid sync services', () => {
    expect(() => validateSyncService('invalid-service')).toThrow(InvalidArgumentError);
    expect(() => validateSyncService('')).toThrow(InvalidArgumentError);
  });
});

describe('validateLocation', () => {
  it('should accept valid locations', () => {
    expect(validateLocation('local')).toBe('local');
    expect(validateLocation('remote')).toBe('remote');
  });

  it('should normalize case', () => {
    expect(validateLocation('LOCAL')).toBe('local');
    expect(validateLocation('Remote')).toBe('remote');
  });

  it('should trim whitespace', () => {
    expect(validateLocation('  local  ')).toBe('local');
  });

  it('should reject invalid locations', () => {
    expect(() => validateLocation('somewhere')).toThrow(InvalidArgumentError);
    expect(() => validateLocation('')).toThrow(InvalidArgumentError);
  });
});

describe('validateRemoteName', () => {
  it('should accept valid remote names', () => {
    expect(validateRemoteName('origin')).toBe('origin');
    expect(validateRemoteName('cella-remote')).toBe('cella-remote');
    expect(validateRemoteName('upstream')).toBe('upstream');
  });

  it('should trim whitespace', () => {
    expect(validateRemoteName('  origin  ')).toBe('origin');
  });

  it('should reject empty remote names', () => {
    expect(() => validateRemoteName('')).toThrow(InvalidArgumentError);
    expect(() => validateRemoteName('   ')).toThrow(InvalidArgumentError);
  });
});
