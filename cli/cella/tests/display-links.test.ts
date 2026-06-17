/**
 * Unit tests for CLI output link formatting.
 *
 * Covers the pure display helpers `formatFetchedUpstreamDetail` and
 * `formatMergeInProgressDetail`, including the VS Code diff/open link behavior
 * that backs the auto-managed upstream view worktree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LinkOptions } from '../src/utils/display';
import { formatFetchedUpstreamDetail, formatMergeInProgressDetail } from '../src/utils/display';

/** A short OSC-8 hyperlink contains the URL between the open/close sequences. */
const VSCODE_DIFF = 'command:vscode.diff';
const VSCODE_OPEN = 'command:vscode.open';

function makeCommits(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    hash: `${i}`.padStart(40, '0'),
    message: `commit ${i + 1}`,
    date: `${i + 1} minutes ago`,
  }));
}

describe('formatFetchedUpstreamDetail', () => {
  it('uses singular wording for a single commit', () => {
    const out = formatFetchedUpstreamDetail(1, makeCommits(1));
    expect(out).toContain('1 new commit since last merge');
  });

  it('uses plural wording for multiple commits', () => {
    const out = formatFetchedUpstreamDetail(3, makeCommits(3));
    expect(out).toContain('3 new commits since last merge');
  });

  it('caps the shown commits and reports the remainder', () => {
    const out = formatFetchedUpstreamDetail(5, makeCommits(5), undefined, 2);
    expect(out).toContain('commit 1');
    expect(out).toContain('commit 2');
    expect(out).not.toContain('commit 3');
    expect(out).toContain('... and 3 more');
  });

  it('embeds clickable commit links when a GitHub URL is provided', () => {
    const commits = makeCommits(1);
    const out = formatFetchedUpstreamDetail(1, commits, 'https://github.com/cellajs/cella');
    expect(out).toContain(`https://github.com/cellajs/cella/commit/${commits[0].hash}`);
  });

  it('degrades gracefully without a GitHub URL (no hyperlink escapes)', () => {
    const out = formatFetchedUpstreamDetail(1, makeCommits(1));
    // No OSC-8 hyperlink escape sequence should be present.
    expect(out).not.toContain('\x1b]8;;');
  });
});

describe('formatMergeInProgressDetail', () => {
  let viewDir: string;
  let forkDir: string;

  beforeEach(() => {
    viewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-view-test-'));
    forkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-fork-test-'));
  });

  afterEach(() => {
    fs.rmSync(viewDir, { recursive: true, force: true });
    fs.rmSync(forkDir, { recursive: true, force: true });
  });

  it('shows only the conflict count when there are no auto-merged files', () => {
    const out = formatMergeInProgressDetail(2, [], {});
    expect(out).toContain('2 conflicts to resolve in IDE');
    expect(out).not.toContain('auto-merged files');
  });

  it('caps the auto-merged file list and reports the remainder', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const out = formatMergeInProgressDetail(1, files, {}, 2);
    expect(out).toContain('auto-merged files (3):');
    expect(out).toContain('... + 1 more');
  });

  it('emits a VS Code diff link when the file exists in the view worktree', () => {
    fs.writeFileSync(path.join(viewDir, 'a.ts'), 'upstream\n');
    const options: LinkOptions = { upstreamViewPath: viewDir, forkPath: forkDir };

    const out = formatMergeInProgressDetail(1, ['a.ts'], options);

    expect(out).toContain(VSCODE_OPEN); // fork file open link
    expect(out).toContain(VSCODE_DIFF); // upstream-vs-fork diff link
  });

  it('omits the diff link for files absent from the view worktree', () => {
    // 'b.ts' does not exist in viewDir.
    const options: LinkOptions = { upstreamViewPath: viewDir, forkPath: forkDir };

    const out = formatMergeInProgressDetail(1, ['b.ts'], options);

    expect(out).toContain(VSCODE_OPEN); // open link still rendered
    expect(out).not.toContain(VSCODE_DIFF); // but no diff link
  });

  it('omits the diff link when no view worktree path is provided', () => {
    fs.writeFileSync(path.join(viewDir, 'a.ts'), 'upstream\n');
    const options: LinkOptions = { forkPath: forkDir };

    const out = formatMergeInProgressDetail(1, ['a.ts'], options);

    expect(out).not.toContain(VSCODE_DIFF);
  });
});
