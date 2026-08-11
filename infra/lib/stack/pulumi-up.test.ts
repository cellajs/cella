import { describe, expect, it } from 'vitest';
import { classifyDuplicateSecretError, parseOrphanedDeletes } from './pulumi-up';

describe('classifyDuplicateSecretError', () => {
  it('detects a duplicate-secret conflict and extracts the name', () => {
    const output = [
      'Diagnostics:',
      '  scaleway:secrets/secret:Secret (secret-admin-email):',
      "    error: 1 error occurred: scaleway-sdk-go: secret with name 'admin-email' already exists",
    ].join('\n');
    expect(classifyDuplicateSecretError(output)).toEqual({ name: 'admin-email' });
  });

  it('detects the conflict without a quoted name', () => {
    const output = 'error: creating Secret: secret already exists in this project';
    expect(classifyDuplicateSecretError(output)).toEqual({ name: undefined });
  });

  it('ignores unrelated failures', () => {
    expect(classifyDuplicateSecretError('error: insufficient permissions: write secret')).toBeUndefined();
    expect(classifyDuplicateSecretError('')).toBeUndefined();
  });
});

describe('parseOrphanedDeletes', () => {
  it('collects delete URNs whose provider returned a 404 not found', () => {
    const urn = 'urn:pulumi:production::infra::scaleway:secrets/secret:Secret::secret-admin-email';
    const output = [
      `error: deleting ${urn}: `,
      '  * scaleway-sdk-go: http error 404 Not Found: resource not found',
    ].join('\n');
    expect(parseOrphanedDeletes(output)).toEqual([urn]);
  });

  it('excludes deletes that failed for other reasons', () => {
    const urn = 'urn:pulumi:production::infra::scaleway:secrets/secret:Secret::secret-admin-email';
    expect(parseOrphanedDeletes(`error: deleting ${urn}: \n  * 403 forbidden`)).toEqual([]);
  });
});
