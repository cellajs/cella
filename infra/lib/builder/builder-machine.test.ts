import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDER_SCRIPT, type BuilderValues, builderCloudConfig, containerScript } from './builder-machine';
import { S3_SCRIPT } from './s3-script';

const values: BuilderValues = {
  SHA: 'a'.repeat(40),
  REPO: 'https://github.com/cellajs/cella.git',
  REGION: 'nl-ams',
  PROJECT: 'project-1',
  REGISTRY_HOST: 'rg.nl-ams.scw.cloud',
  DIAG_BUCKET: 'app-boot-diag',
  FRONTEND_BUCKET: 'app-frontend',
  BUNDLE_ID: 'bundle-1',
  BOOT_AK: 'SCWBOOTACCESSKEY0001',
  BOOT_SK: 'boot-secret-key-value',
  NODE_IMAGE: 'node:26-bookworm-slim',
};

describe('the builder machine', () => {
  it('runs a script bash accepts', () => {
    const check = spawnSync('bash', ['-n'], { input: BUILDER_SCRIPT, encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it('writes to Object Storage with a script Node accepts', () => {
    const file = join(mkdtempSync(join(tmpdir(), 's3-')), 's3.mjs');
    writeFileSync(file, S3_SCRIPT);
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it("fetches a private repository with its read key as a header of that one fetch, and drops the key before the app's code runs", () => {
    const lines = BUILDER_SCRIPT.split('\n');
    const keyed = lines.find((line) => line.includes('http.extraHeader'));
    expect(keyed).toContain('fetch -q --depth 1 origin "$SHA"');
    expect(keyed).not.toContain('remote add');
    expect(lines.indexOf('rm -f /run/builder.repo')).toBeGreaterThan(lines.indexOf(keyed ?? ''));
    expect(lines.indexOf('rm -f /run/builder.repo')).toBeLessThan(lines.indexOf('step build'));
  });

  it("must not hand a key to the app's code: the container gets the frontend env file only", () => {
    const run = BUILDER_SCRIPT.split('\n').find((line) => line.startsWith('docker run'));
    expect(run).toBeDefined();
    expect(run).not.toMatch(/\s-e\s|--env\s/);
    expect(run).toContain('--env-file /etc/builder-frontend.env');
    for (const script of [
      containerScript({ pnpmVersion: '11.8.0', sha: values.SHA, frontendBucketUrl: 'https://app-frontend.s3.nl-ams.scw.cloud' }),
    ]) {
      expect(script).not.toMatch(/SCW_|_AK|_SK|AWS_/);
    }
  });

  it('keeps the keys in the one file only root reads', () => {
    const document = builderCloudConfig({ values, frontendEnv: { APP_MODE: 'staging' }, bake: { group: {} }, container: 'true\n' });
    const files = document.split('\n  - path: ').slice(1);
    const holding = files.filter((file) => file.includes(values.BOOT_SK)).map((file) => file.split('\n')[0]);
    expect(holding).toEqual(['/etc/builder.env']);
    expect(files.find((file) => file.startsWith('/etc/builder.env'))).toContain("permissions: '0600'");
  });

  it('builds no frontend for an app without one', () => {
    const script = containerScript({ pnpmVersion: '11.8.0', sha: values.SHA });
    expect(script).toContain('pnpm --filter infra boot:build');
    expect(script).not.toContain('frontend');
  });
});
