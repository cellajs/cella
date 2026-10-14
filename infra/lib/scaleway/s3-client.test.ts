import { describe, expect, it } from 'vitest';
import { projectAccessKey } from './s3-client';

describe('projectAccessKey', () => {
  it('names the project after the access key, the form Object Storage reads', () => {
    expect(projectAccessKey('SCWKEY', 'project-staging')).toBe('SCWKEY@project-staging');
  });

  it('keeps a key that already names a project', () => {
    expect(projectAccessKey('SCWKEY@project-production', 'project-staging')).toBe('SCWKEY@project-production');
  });
});
