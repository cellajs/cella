/**
 * Analyze service for sync CLI v2.
 *
 * Dry run of sync - shows what would change without applying.
 * Uses the same merge-engine as sync, but discards the result.
 */

import { spawnSync } from 'node:child_process';
import type { MergeResult, RuntimeConfig } from '../config/types';
import { refreshViewWorktree } from '../utils/cleanup';
import pc from '../utils/colors';
import { openVsCodeDiff } from '../utils/diff';
import {
  createSpinner,
  type LinkOptions,
  printAheadPreview,
  printDivergedPreview,
  printDriftedWarning,
  printPinnedPreview,
  printSummary,
  printSyncFiles,
  spinnerSuccess,
  spinnerText,
  writeLogFile,
  writeStdout,
} from '../utils/display';
import { runMergeEngine } from './merge-engine';

type AnalyzeScopeResolved = 'all' | 'risk' | 'protected';

const scopeStatuses: Record<AnalyzeScopeResolved, Set<string>> = {
  all: new Set(['ahead', 'drifted', 'diverged']),
  risk: new Set(['drifted', 'diverged']),
  protected: new Set(['ahead']),
};

function resolveScope(scope?: string): AnalyzeScopeResolved {
  if (!scope) return 'all';
  if (scope === 'all' || scope === 'risk' || scope === 'protected') return scope;
  throw new Error(`invalid --scope '${scope}'. expected one of: all, risk, protected`);
}

function filterByScope(files: MergeResult['files'], scope: AnalyzeScopeResolved): MergeResult['files'] {
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
  const forkName = 'fork/';
  const upstreamName = 'upstream/';

  const diffResult = spawnSync(
    'git',
    [
      'diff',
      '--no-color',
      `--src-prefix=${upstreamName}`,
      `--dst-prefix=${forkName}`,
      `${config.upstreamRef}..HEAD`,
      '--',
      filePath,
    ],
    { cwd: config.forkPath, stdio: ['pipe', 'pipe', 'pipe'] },
  );

  if (diffResult.status !== 0) {
    const stderr = diffResult.stderr.toString().trim();
    throw new Error(stderr || `failed to diff ${filePath}`);
  }

  writeStdout(diffResult.stdout.toString());
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

  const scope = resolveScope(config.scope);
  const scopedFiles = filterByScope(result.files, scope);

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
  printSyncFiles(result.files, linkOptions);
  printAheadPreview(result.files, linkOptions);
  printDriftedWarning(result.files, linkOptions);
  printDivergedPreview(result.files, linkOptions);
  printPinnedPreview(result.files, linkOptions);

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
