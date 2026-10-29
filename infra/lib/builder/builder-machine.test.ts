import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDER_SCRIPT, type BuilderValues, bootBundleScript, builderCloudConfig, frontendScript } from './builder-machine';
import { S3_SCRIPT } from './s3-script';

const values: BuilderValues = {
  SHA: 'a'.repeat(40),
  REPO: 'https://github.com/cellajs/cella.git',
  REGION: 'nl-ams',
  PROJECT: 'project-1',
  REGISTRY_HOST: 'rg.nl-ams.scw.cloud',
  DIAG_BUCKET: 'app-boot-diag',
  FRONTEND_BUCKET: 'app-frontend',
  BUILDER_AK: 'SCWBUILDERACCESSKEY1',
  BUILDER_SK: 'builder-secret-key-value',
  REPO_KEY: 'github_pat_read_only',
  NODE_IMAGE: 'node:26-bookworm-slim',
  EPOCH: '0123456789ab',
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
    expect(lines.indexOf('unset REPO_KEY')).toBeGreaterThan(lines.indexOf(keyed ?? ''));
    expect(lines.indexOf('unset REPO_KEY')).toBeLessThan(lines.indexOf('step build'));
  });

  it("must not hand a key to the app's code: its containers get no key and no metadata service", () => {
    const lines = BUILDER_SCRIPT.split('\n');
    const runs = lines.filter((line) => line.trim().startsWith('docker run'));
    expect(runs.length).toBeGreaterThan(3);
    // A container that gets a key runs the Object Storage script and nothing of the app; every other container gets none.
    for (const run of runs) {
      if (run.includes('S3_AK=')) expect(run).toContain('-v /etc/builder-s3.mjs:/s3.mjs:ro');
      else expect(run).not.toMatch(/\s-e\s|--env\s/);
    }
    for (const script of [bootBundleScript('11.8.0'), frontendScript('11.8.0')]) expect(script).not.toMatch(/SCW_|_AK|_SK|AWS_/);
    const block = lines.findIndex((line) => line.includes('-d 169.254.42.42 -j DROP'));
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(lines.findIndex((line) => line.startsWith('docker run')));
  });

  it("must not upload a file the app's build pointed outside its output, or to a key other than its place", () => {
    const dir = mkdtempSync(join(tmpdir(), 'upload-'));
    const root = join(dir, 'dist');
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'assets', 'a.js'), 'ok');
    writeFileSync(join(root, 'index.html'), '<html>');
    writeFileSync(join(dir, 'secret'), 'S3_SK=key');
    symlinkSync(join(dir, 'secret'), join(root, 'assets', 'b.js'));
    const script = join(dir, 's3.mjs');
    writeFileSync(script, S3_SCRIPT);
    const upload = (rows: string[][]) => {
      writeFileSync(join(dir, 'list'), rows.map((row) => `${row.join('\t')}\n`).join(''));
      return spawnSync(process.execPath, [script, 'upload', 'bucket', join(dir, 'list'), root, 'releases/x/'], {
        encoding: 'utf8',
        env: { ...process.env, REGION: 'test', S3_AK: 'ak', S3_SK: 'sk' },
      });
    };
    const valid = [join(root, 'assets', 'a.js'), 'assets/a.js'];
    for (const attack of [
      [join(root, 'assets', 'b.js'), 'assets/b.js'],
      [join(dir, 'secret'), 'assets/c.js'],
      [join(root, 'index.html'), 'releases/y/index.html'],
      [join(root, 'assets', 'a.js'), 'releases/x/a.js'],
    ]) {
      const result = upload([valid, attack]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('refused');
    }
  });

  it('keeps the keys in the one file only root reads', () => {
    const document = builderCloudConfig({ values, frontendEnv: { APP_MODE: 'staging' }, bake: { group: {} }, boot: 'true\n', frontend: 'true\n' });
    const files = document.split('\n  - path: ').slice(1);
    for (const key of [values.BUILDER_SK, values.REPO_KEY]) {
      expect(files.filter((file) => file.includes(key)).map((file) => file.split('\n')[0])).toEqual(['/etc/builder.env']);
    }
    expect(files.find((file) => file.startsWith('/etc/builder.env'))).toContain("permissions: '0600'");
  });

  it('builds the boot bundle with the engine only, apart from the frontend', () => {
    expect(bootBundleScript('11.8.0')).toContain('pnpm --filter infra boot:build');
    expect(bootBundleScript('11.8.0')).not.toContain('frontend');
  });
});
