/**
 * Tests for the shared VS Code diff helper.
 *
 * `openVsCodeDiff` prefers the upstream view worktree and falls back to
 * materializing the upstream blob for files absent from it. We shim `code` on
 * PATH so its arguments are recorded instead of launching the real editor.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openVsCodeDiff } from '../src/utils/diff';

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

describe('openVsCodeDiff', () => {
  let testDir: string;
  let forkPath: string;
  let binDir: string;
  let argsFile: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-diff-test-'));
    forkPath = path.join(testDir, 'fork');
    binDir = path.join(testDir, 'bin');
    argsFile = path.join(testDir, 'code-args.txt');
    fs.mkdirSync(binDir);

    // Fake `code` that records the args it was launched with.
    const codeShim = path.join(binDir, 'code');
    fs.writeFileSync(codeShim, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CODE_ARGS_FILE"\n`);
    fs.chmodSync(codeShim, 0o755);

    // Real git repo with a committed file used as the upstream ref source.
    fs.mkdirSync(forkPath);
    exec('git init -b main', forkPath);
    exec('git config user.email "test@test.com" && git config user.name "Test"', forkPath);
    fs.writeFileSync(path.join(forkPath, 'x.ts'), 'upstream content\n');
    exec('git add -A && git commit -m "initial"', forkPath);

    originalPath = process.env.PATH;
    process.env.PATH = `${binDir}:${originalPath ?? ''}`;
    process.env.CODE_ARGS_FILE = argsFile;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    delete process.env.CODE_ARGS_FILE;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('diffs against the view worktree when the file exists there', () => {
    const viewPath = path.join(testDir, 'view');
    fs.mkdirSync(viewPath);
    const upstreamFile = path.join(viewPath, 'x.ts');
    fs.writeFileSync(upstreamFile, 'upstream content\n');

    openVsCodeDiff(forkPath, 'HEAD', viewPath, 'x.ts');

    const recorded = fs.readFileSync(argsFile, 'utf-8');
    expect(recorded).toContain('--diff');
    expect(recorded).toContain(upstreamFile);
    expect(recorded).toContain(path.join(forkPath, 'x.ts'));
  });

  it('falls back to materializing the upstream blob when absent from the worktree', () => {
    // viewPath is undefined → must read the blob via `git show`.
    openVsCodeDiff(forkPath, 'HEAD', undefined, 'x.ts');

    const recorded = fs.readFileSync(argsFile, 'utf-8').trim();
    expect(recorded).toContain('--diff');
    expect(recorded).toContain('cella-analyze-diff');

    // The materialized temp file should carry the committed upstream content.
    const tmpFile = recorded.split(' ').find((token) => token.includes('cella-analyze-diff'));
    expect(tmpFile).toBeDefined();
    expect(fs.readFileSync(tmpFile as string, 'utf-8')).toBe('upstream content\n');
  });

  it('throws a clear error when the file does not exist at the ref', () => {
    expect(() => openVsCodeDiff(forkPath, 'HEAD', undefined, 'missing.ts')).toThrow();
  });
});
