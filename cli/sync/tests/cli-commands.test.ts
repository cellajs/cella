import { InvalidArgumentError } from 'commander';
import { describe, expect, it } from 'vitest';
import {
  validateBranchName,
  validateLocation,
  validateRemoteName,
  validateSyncService,
} from '../src/modules/cli/commands';

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
    expect(validateSyncService('sync')).toBe('sync');
    expect(validateSyncService('analyze')).toBe('analyze');
    expect(validateSyncService('validate')).toBe('validate');
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
