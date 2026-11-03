import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseReleaseManifest } from '../deploy/release-archives';
import { agentBundleScript, BUILDER_ARCHIVE_DIR, BUILDER_SCRIPT, type BuilderValues, builderCloudConfig, frontendScript } from './builder-machine';

const values: BuilderValues = {
  SHA: 'a'.repeat(40),
  REPO: 'https://github.com/cellajs/cella.git',
  REPO_KEY: 'github_pat_read_only',
  NODE_IMAGE: 'node:26-bookworm-slim',
  FRONTEND: '1',
};
const links = { step: 'https://diag.s3.nl-ams.scw.cloud/boot-diag/builder/a/step?X-Amz-Signature=00', 'image:backend': 'https://x?y=1&z=2' };

describe('the builder machine', () => {
  it('runs a script bash accepts', () => {
    const check = spawnSync('bash', ['-n'], { input: BUILDER_SCRIPT, encoding: 'utf8' });
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

  it("must not hold a Scaleway key: every write goes through a link, and the app's containers get no env and no metadata service", () => {
    const document = builderCloudConfig({
      values,
      links,
      frontendEnv: { APP_MODE: 'staging' },
      bake: { group: {} },
      agent: 'true\n',
      frontend: 'true\n',
    });
    expect(document).not.toMatch(/SCW[A-Z0-9]{17}|S3_AK|S3_SK|BUILDER_SK|docker login|--push/);
    const lines = BUILDER_SCRIPT.split('\n');
    for (const run of lines.filter((line) => line.trim().startsWith('docker run'))) expect(run).not.toMatch(/\s-e\s|--env\s/);
    for (const script of [agentBundleScript('11.8.0'), frontendScript('11.8.0')]) expect(script).not.toMatch(/SCW_|_AK|_SK|AWS_/);
    const block = lines.findIndex((line) => line.includes('-d 169.254.42.42 -j DROP'));
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(lines.findIndex((line) => line.startsWith('docker run')));
  });

  it('keeps the repository read key and the links in files only root reads', () => {
    const document = builderCloudConfig({
      values,
      links,
      frontendEnv: { APP_MODE: 'staging' },
      bake: { group: {} },
      agent: 'true\n',
      frontend: 'true\n',
    });
    const files = document.split('\n  - path: ').slice(1);
    const holding = (needle: string) => files.filter((file) => file.includes(needle)).map((file) => file.split('\n')[0]);
    expect(holding(values.REPO_KEY)).toEqual(['/etc/builder.env']);
    expect(holding(links.step)).toEqual(['/etc/builder-links.tsv']);
    for (const path of ['/etc/builder.env', '/etc/builder-links.tsv'])
      expect(files.find((file) => file.startsWith(path))).toContain("permissions: '0600'");
  });

  it('writes a manifest the deploy parses, its archives on the disk and not in the memory of /run', () => {
    // Staging could not have shipped it: a manifest with unquoted image names is no JSON, so every deploy of the sha failed its build.
    const lines = BUILDER_SCRIPT.split('\n');
    const digest = lines.slice(lines.indexOf('digest() {'), lines.indexOf('digest() {') + 3);
    const manifest = lines.slice(lines.indexOf("IMAGES=''"), lines.findIndex((line) => line.startsWith('printf \'{"release"')) + 1);
    expect(lines).toContain(`mkdir -p ${BUILDER_ARCHIVE_DIR}`);
    const dir = mkdtempSync(join(tmpdir(), 'builder-'));
    mkdirSync(join(dir, 'images'));
    for (const name of ['backend', 'infra-boot']) writeFileSync(join(dir, 'images', `${name}.tar`), name);
    // The tools the digest names, as the builder's Linux has them; put and tar are the builder's calls, not the manifest's.
    const tools = [
      'put() { :; }',
      'tar() { touch "$5"; }',
      `sha256sum() { echo "${'a'.repeat(64)}  $1"; }`,
      `md5sum() { echo "${'b'.repeat(32)}  $1"; }`,
      'stat() { echo 10; }',
    ];
    const script = [`SHA=${'c'.repeat(40)}`, 'FRONTEND=1', ...tools, ...digest, ...manifest]
      .join('\n')
      .replaceAll(BUILDER_ARCHIVE_DIR, join(dir, 'images'))
      .replaceAll('/var/lib/release/', `${dir}/`)
      .replaceAll('/run/', `${dir}/`);
    const run = spawnSync('bash', ['-eo', 'pipefail'], { input: script, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    const parsed = parseReleaseManifest(readFileSync(join(dir, 'manifest.json'), 'utf8'), 'c'.repeat(40));
    expect(Object.keys(parsed.images).sort()).toEqual(['backend', 'infra-boot']);
    expect(parsed.frontend).toEqual({ sha256: 'a'.repeat(64), md5: 'b'.repeat(32), bytes: 10 });
  });

  it('builds the boot bundle with the engine only, apart from the frontend', () => {
    expect(agentBundleScript('11.8.0')).toContain('pnpm --filter infra agent:build');
    expect(agentBundleScript('11.8.0')).not.toContain('frontend');
  });
});
