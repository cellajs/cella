/**
 * Analyze service for sync CLI v2.
 *
 * Dry run of sync - shows what would change without applying.
 * Uses the same merge-engine as sync, but discards the result.
 */

import { basename } from 'node:path';
import type { MergeResult, RuntimeConfig } from '../config/types';
import { refreshViewWorktree } from '../utils/cleanup';
import pc from '../utils/colors';
import { gitDiffFile, openVsCodeDiff } from '../utils/diff';
import {
  createSpinner,
  type LinkOptions,
  printAnalysisFileGroups,
  printSummary,
  spinnerSuccess,
  spinnerText,
  writeLogFile,
  writeStdout,
} from '../utils/display';
import { runMergeEngine } from './merge-engine';

const scopeStatuses: Record<'all' | 'risk' | 'protected', Set<string>> = {
  all: new Set(['ahead', 'drifted', 'diverged']),
  risk: new Set(['drifted', 'diverged']),
  protected: new Set(['ahead']),
};

function filterByScope(files: MergeResult['files'], scope: 'all' | 'risk' | 'protected'): MergeResult['files'] {
  const statuses = scopeStatuses[scope];
  return files.filter((f) => statuses.has(f.status));
}

function findTargetFile(files: MergeResult['files'], targetPath: string) {
  const exact = files.find((f) => f.path === targetPath);
  if (exact) return exact;

  const normalized = targetPath.replace(/^\.\//, '');
  return files.find((f) => f.path === normalized);
}

function printUnifiedDiff(config: RuntimeConfig, filePath: string): void {
  // Label the upstream side 'cella/' and the local side with the repo's folder name
  // so the diff reads cella/<path> vs <fork>/<path> instead of opaque a/ and b/.
  const diff = gitDiffFile(config.forkPath, `${config.upstreamRef}..HEAD`, filePath, {
    dstPrefix: basename(config.forkPath),
    color: 'never',
  });
  writeStdout(diff.toString());
}

/**
 * Run the analyze service (dry run).
 *
 * Creates worktree, performs merge, shows results, discards worktree.
 */
export async function runAnalyze(config: RuntimeConfig): Promise<MergeResult> {
  createSpinner('starting analysis...');

  const result = await runMergeEngine(config, {
    apply: false,
    onProgress: (message) => {
      spinnerText(message);
    },
    onStep: (label, detail) => {
      spinnerSuccess(label, detail);
      createSpinner('...');
    },
  });

  spinnerSuccess();

  const scopedFiles = filterByScope(result.files, config.scope ?? 'all');

  if (config.diff) {
    const file = findTargetFile(scopedFiles, config.diff) ?? findTargetFile(result.files, config.diff);
    if (!file) throw new Error(`file not found in analysis results: ${config.diff}`);
    printUnifiedDiff(config, file.path);
    return result;
  }

  if (config.json) {
    const out = scopedFiles.map((f) => ({
      path: f.path,
      status: f.status,
      changedAt: f.changedAt ?? null,
      changedCommit: f.changedCommit ?? null,
      upstreamChangedAt: f.upstreamChangedAt ?? null,
      upstreamCommit: f.upstreamCommit ?? null,
    }));
    writeStdout(JSON.stringify(out, null, 2));
    return result;
  }

  if (config.list) {
    for (const file of scopedFiles) {
      console.info(file.path);
    }
    return result;
  }

  // Remaining paths (--open-diff and interactive output) need the upstream view
  // worktree for VS Code file links and exact `code --diff` commands, so
  // materialize it exactly once here. Machine-readable modes (--json/--list)
  // and the unified --diff return above and never pay this cost.
  const upstreamViewPath = await refreshViewWorktree(config.forkPath, config.upstreamRef);

  if (config.openDiff) {
    const file = findTargetFile(scopedFiles, config.openDiff) ?? findTargetFile(result.files, config.openDiff);
    if (!file) throw new Error(`file not found in analysis results: ${config.openDiff}`);
    openVsCodeDiff(config.forkPath, config.upstreamRef, upstreamViewPath, file.path);
    console.info(`${pc.green('✓')} opened VS Code diff for ${file.path}`);
    return result;
  }

  // Build link options from result and config
  const linkOptions: LinkOptions = {
    upstreamGitHubUrl: result.upstreamGitHubUrl,
    upstreamBranch: result.upstreamBranch,
    fileLinkMode: config.settings.fileLinkMode,
    upstreamViewPath,
    forkPath: config.forkPath,
  };

  // Print file lists first (analyze shows file lists for review)
  printAnalysisFileGroups(result.files, linkOptions);

  // Print summary at the end
  printSummary(result.summary, 'analysis summary');

  // Write log file if requested
  if (config.logFile) {
    const logPath = writeLogFile(config.forkPath, result.files);
    console.info();
    console.info(pc.dim(`full file list written to: ${logPath}`));
  }

  console.info();

  return result;
}
