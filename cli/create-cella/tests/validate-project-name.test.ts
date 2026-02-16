import { describe, expect, it } from 'vitest';

import { validateProjectName } from '#/utils/validate-project-name';

describe('validateProjectName', () => {
  it('should accept valid project names', () => {
    expect(validateProjectName('my-app')).toEqual({ valid: true });
    expect(validateProjectName('my-cella-app')).toEqual({ valid: true });
    expect(validateProjectName('app123')).toEqual({ valid: true });
  });

  it('should reject invalid project names', () => {
    const result = validateProjectName('My App');
    expect(result.valid).toBe(false);
    expect(result.problems).toBeDefined();
  });

  it('should reject names starting with dots or underscores', () => {
    expect(validateProjectName('.hidden').valid).toBe(false);
    expect(validateProjectName('_private').valid).toBe(false);
  });
});
