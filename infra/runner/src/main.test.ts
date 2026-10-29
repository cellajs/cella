import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startJobRun } from '../../lib/deploy/job-runs.ts';
import { serve } from './main.ts';

vi.mock('../../lib/deploy/job-runs.ts', () => ({
  findJobDefinition: async () => 'definition-1',
  readJobDefinition: async () => ({ env: { MODE: 'production', REPO: 'https://github.com/acme/app.git' } }),
  listJobRuns: async () => [],
  startJobRun: vi.fn(),
  runEnded: () => true,
}));

describe('the runner program', () => {
  it('runs on Node alone, with nothing installed: every module it loads names its imports with their extension', () => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, 'main.ts'), '--help'], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Usage: node runner\/src\/main\.ts/);
  });

  it("starts nothing for a list entry that names another repository than its definition's REPO, and reads nothing from it", async () => {
    const environmentsFile = vi.fn(async () => 'production releases\n');
    const entry = { environment: 'production', projectId: 'p1', region: 'nl-ams', definition: 'acme-main' };
    const line = await serve(
      { ...entry, repository: 'https://github.com/mallory/app.git' },
      { secretKey: 'runner-secret', environmentsFile, dryRun: false },
    );
    expect(line).toMatch(/starts nothing$/);
    expect(environmentsFile).not.toHaveBeenCalled();
    expect(startJobRun).not.toHaveBeenCalled();
  });
});
