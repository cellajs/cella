import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rerunReleaseCheck } from './release-gate';

// A `gh` on PATH that logs every call and answers the lookups: the run is in progress until its status is read a second time.
const FAKE_GH = `#!/bin/sh
echo "$*" >> "$GH_LOG"
case "$*" in
  "pr list"*) echo '[{"headRefName":"release-please--branches--main","headRefOid":"abc"}]' ;;
  "run list"*) echo '[{"databaseId":1,"status":"in_progress"}]' ;;
  "run view 1 --json jobs"*) echo '{"jobs":[{"name":"release-applied","conclusion":"failure","databaseId":7}]}' ;;
  "run view 1 --json status"*) [ "$(grep -c 'json status' "$GH_LOG")" -ge 2 ] && echo '{"status":"completed"}' || echo '{"status":"in_progress"}' ;;
esac
`;

describe('the release check after an apply', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-gate-'));
  const log = join(dir, 'gh.log');
  const path = process.env.PATH;

  beforeEach(() => {
    writeFileSync(join(dir, 'gh'), FAKE_GH);
    chmodSync(join(dir, 'gh'), 0o755);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ repository: 'https://github.com/acme/app' }));
    writeFileSync(log, '');
    process.env.PATH = `${dir}:${path}`;
    process.env.GH_LOG = log;
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.PATH = path;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the failed check again only once the release PR run has ended', async () => {
    const done = rerunReleaseCheck(dir);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(readFileSync(log, 'utf8')).not.toContain('run rerun');
    await vi.advanceTimersByTimeAsync(15_000);
    await done;
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    expect(calls.filter((call) => call.startsWith('run view 1 --json status'))).toHaveLength(2);
    expect(calls.at(-1)).toBe('run rerun --job 7 --repo acme/app');
  });
});
