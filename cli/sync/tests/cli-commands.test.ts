import { InvalidArgumentError } from 'commander';
import { describe, expect, it } from 'vitest';
import { validateBranchName, validateSyncService } from '../src/modules/cli/commands';

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
