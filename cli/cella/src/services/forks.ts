/**
 * Forks service for sync CLI v2.
 *
 * Allows syncing to multiple local fork repositories from an upstream template.
 * Selecting a fork immediately runs sync (+ packages if enabled), then returns to selection.
 */

import { resolve } from 'node:path';
import process from 'node:process';
import { Separator, select } from '@inquirer/prompts';
import type { ForkConfig, RuntimeConfig } from '../config/types';
import pc from '../utils/colors';
import { DEFAULT_SYNC_BRANCH, loadConfig, resolveSyncBranch, resolveUpstream } from '../utils/config';
import { warningMark } from '../utils/display';
import { assertClean, getCommitInfo, getCurrentBranch, getStoredSyncRef, git } from '../utils/git';
import { printNoForksHint, validateForkPath } from './fork-utils';

/**
 * Resolve the branch a fork receives syncs on.
 *
 * The fork's own `cella.config.ts` (`settings.syncBranch`) is the source of truth.
 * Falls back to the default sync branch when the fork config can't be read.
 */
async function resolveForkBranch(forkPath: string): Promise<string> {
  try {
    const forkConfig = await loadConfig(forkPath);
    return resolveSyncBranch(forkConfig.settings);
  } catch {
    return DEFAULT_SYNC_BRANCH;
  }
}

/**
 * Run preflight checks for the selected fork.
 */
async function preflightFork(forkPath: string, forkBranch: string): Promise<void> {
  const currentBranch = await getCurrentBranch(forkPath);
  if (currentBranch !== forkBranch) {
    throw new Error(
      `fork must be on branch '${forkBranch}'. currently on '${currentBranch}'. run: git switch ${forkBranch}`,
    );
  }

  await assertClean(forkPath, 'fork');
}

/** Status info gathered from a fork repository */
interface ForkStatus {
  branch: string;
  expectedBranch: string;
  branchMatch: boolean;
  dirty: number;
  lastSync: { date: string; message: string } | null;
}

/**
 * Gather git status info for a fork: branch, dirty state, last sync.
 */
async function gatherForkStatus(forkPath: string, expectedBranch: string): Promise<ForkStatus> {
  const [branch, porcelain, syncRef] = await Promise.all([
    getCurrentBranch(forkPath).catch(() => 'unknown'),
    git(['status', '--porcelain'], forkPath, { ignoreErrors: true }),
    getStoredSyncRef(forkPath),
  ]);

  const dirty = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
  const branchMatch = branch === expectedBranch;

  let lastSync: { date: string; message: string } | null = null;
  if (syncRef) {
    const commitInfo = await getCommitInfo(forkPath, syncRef).catch(() => null);
    lastSync = { date: commitInfo?.date ?? 'unknown', message: commitInfo?.message ?? '' };
  }

  return { branch, expectedBranch, branchMatch, dirty, lastSync };
}

/**
 * Format a fork choice label with status info.
 */
function formatForkChoice(name: string, status: ForkStatus | null): string {
  if (!status) return name;

  // Branch: cyan if matching expected, yellow with mismatch indicator if not
  const branchPart = status.branchMatch
    ? pc.dim(`[${status.branch}]`)
    : pc.yellow(`[${status.branch} ≠ ${status.expectedBranch}]`);

  // Sync: date and truncated commit message
  let syncPart: string;
  if (status.lastSync) {
    const msg =
      status.lastSync.message.length > 36 ? `${status.lastSync.message.slice(0, 36)}…` : status.lastSync.message;
    syncPart = pc.dim(`${status.lastSync.date}`);
    if (msg) syncPart += pc.dim(` '${msg}'`);
  } else {
    syncPart = pc.dim('never synced');
  }

  // Dirty state: only show if there are uncommitted changes
  const dirtyPart = status.dirty > 0 ? pc.yellow(`${status.dirty} uncommitted`) : '';

  const parts = [name, branchPart, syncPart];
  if (dirtyPart) parts.push(dirtyPart);

  return parts.join(pc.dim(' · '));
}

/**
 * Build fork choices with live status info gathered in parallel.
 */
async function buildForkChoices(
  forks: ForkConfig[],
  basePath: string,
): Promise<Array<{ value: string; name: string; disabled?: string }>> {
  const validated = forks.map((fork) => validateForkPath(fork, basePath, true));

  // Gather status for all valid forks in parallel
  const statusEntries = await Promise.all(
    validated
      .filter((v) => v.valid)
      .map(async (v) => {
        const expectedBranch = await resolveForkBranch(v.resolvedPath);
        const status = await gatherForkStatus(v.resolvedPath, expectedBranch);
        return { path: v.fork.localPath, status };
      }),
  );
  const statusMap = new Map(statusEntries.map((e) => [e.path, e.status]));

  return validated.map((v) => {
    if (!v.valid) {
      return {
        value: v.fork.localPath,
        name: `${v.fork.name}  ${pc.dim(v.fork.localPath)}`,
        disabled: v.error,
      };
    }
    return {
      value: v.fork.localPath,
      name: formatForkChoice(v.fork.name, statusMap.get(v.fork.localPath) ?? null),
    };
  });
}

/**
 * Sync a single fork: preflight, sync, and optionally run packages.
 */
async function syncFork(config: RuntimeConfig, fork: ForkConfig, forkPath: string): Promise<void> {
  console.info();
  console.info(pc.cyan(`syncing to ${fork.name}...`));
  console.info(pc.dim(`path: ${forkPath}`));
  console.info();

  const forkConfig = await loadConfig(forkPath);

  // The fork's own config is the source of truth for its sync branch.
  const forkBranch = resolveSyncBranch(forkConfig.settings);

  // Preflight
  await preflightFork(forkPath, forkBranch);

  // Build runtime config for the fork
  const { branchRef } = resolveUpstream(forkConfig.settings);
  const upstreamRef = branchRef;

  const forkRuntimeConfig: RuntimeConfig = {
    ...forkConfig,
    forkPath,
    upstreamRef,
    service: 'sync',
    logFile: config.logFile,
    list: false,
    json: false,
    verbose: config.verbose,
    hard: config.hard,
  };

  // Run sync
  const { runSync } = await import('./sync');
  const result = await runSync(forkRuntimeConfig);

  // Auto-run packages if enabled and sync succeeded
  if (forkConfig.settings.syncWithPackages !== false && result.success) {
    const { runPackages } = await import('./packages');
    await runPackages(forkRuntimeConfig);
  } else if (forkConfig.settings.syncWithPackages !== false) {
    console.warn(
      `${warningMark} package sync skipped because the merge has unresolved conflicts. resolve them, commit the merge, then rerun sync.`,
    );
  }
}

/**
 * Run the forks service.
 *
 * Lists configured forks. Selecting a fork runs sync immediately,
 * then returns to the selection menu.
 */
export async function runForks(config: RuntimeConfig): Promise<void> {
  const forks = config.forks ?? [];

  if (forks.length === 0) {
    printNoForksHint('add forks to your config:');
    return;
  }

  // Non-interactive mode via --fork flag
  if (config.fork) {
    const match = forks.find((f) => f.name === config.fork);
    if (!match) {
      console.error(pc.red(`fork '${config.fork}' not found in config`));
      return;
    }
    const resolvedPath = resolve(config.forkPath, match.localPath);
    await syncFork(config, match, resolvedPath);
    return;
  }

  // Interactive loop: select fork → sync → return to selection
  // Choices are rebuilt each iteration to reflect updated status
  while (true) {
    const choices = await buildForkChoices(forks, config.forkPath);
    const forkChoices = [...choices, new Separator('─'.repeat(40)), { value: '_exit', name: pc.dim('exit') }];

    const selectedPath = await select<string>({
      message: 'select fork to sync:',
      choices: forkChoices,
      loop: false,
    });

    if (selectedPath === '_exit') {
      process.exit(0);
    }

    const resolvedForkPath = resolve(config.forkPath, selectedPath);
    const selectedFork = forks.find((f) => f.localPath === selectedPath);
    if (!selectedFork) {
      console.error(pc.red(`fork '${selectedPath}' not found in config`));
      continue;
    }

    await syncFork(config, selectedFork, resolvedForkPath);

    console.info();
  }
}
