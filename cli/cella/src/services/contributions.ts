/**
 * Contributions service for sync CLI.
 *
 * Upstream-side (cella): based on the configured `forks`, lets the user select
 * one or more forks, pulls each fork's `pullBranch` and builds a clean local
 * `contrib/<fork>` branch with only that fork's contributed files. Then shows
 * an interactive TUI to review and adopt individual files into the working tree.
 */

import { spawnSync } from 'node:child_process';
import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  useMemo,
  usePagination,
  useState,
} from '@inquirer/core';
import { checkbox } from '@inquirer/prompts';
import type { FileStatus, RuntimeConfig } from '../config/types';
import pc from '../utils/colors';
import { loadConfig } from '../utils/config';
import { createSpinner, DIVIDER, showDiffInPager, spinnerFail, spinnerSuccess, warningMark } from '../utils/display';
import { getCurrentBranch, git } from '../utils/git';
import { buildContribBranch, countDetection, detectContributableFiles } from './contrib-core';
import { printNoForksHint, type ValidatedFork, validateForkPath } from './fork-utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface ContribItem {
  /** File path relative to repo root */
  path: string;
  /** Fork name */
  fork: string;
  /** Local contrib branch ref (e.g., contrib/myfork) */
  ref: string;
  /** True if adopting this means deleting the file in cella */
  deleted: boolean;
  /** Analyzer status from cella's POV (behind = fork ahead, diverged = both changed) */
  status?: FileStatus;
  /** Relative date of the fork's change (e.g. '3 days ago') */
  changedAt?: string;
  /** Whether file is selected for acceptance */
  checked: boolean;
}

interface ContribPromptConfig {
  message: string;
  items: ContribItem[];
  /** Base ref the contrib branches were built on (for diffing) */
  baseRef: string;
  /** Repo path where contrib branches live */
  cwd: string;
  pageSize?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Show diff in terminal for a contrib file using a pager.
 */
function showContribDiff(item: ContribItem, baseRef: string, cwd: string): void {
  const diffResult = spawnSync('git', ['diff', '--color=always', `${baseRef}..${item.ref}`, '--', item.path], { cwd });

  showDiffInPager(diffResult.stdout);
}

// ── Custom prompt ────────────────────────────────────────────────────────────

/**
 * Interactive prompt for reviewing contributed files.
 * Returns items selected for acceptance.
 */
const contribPrompt = createPrompt<ContribItem[], ContribPromptConfig>((config, done) => {
  const { pageSize = 20, baseRef, cwd } = config;

  const [items, setItems] = useState<ContribItem[]>(config.items);
  const [active, setActive] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [promptStatus, setPromptStatus] = useState<'idle' | 'done'>('idle');

  const bounds = useMemo(() => {
    if (items.length === 0) return { first: 0, last: 0 };
    return { first: 0, last: items.length - 1 };
  }, [items]);

  useKeypress(async (key) => {
    if (items.length === 0) {
      if (isEnterKey(key) || key.name === 'q') {
        setPromptStatus('done');
        done([]);
      }
      return;
    }

    // q = quit
    if (key.name === 'q') {
      setPromptStatus('done');
      done([]);
      return;
    }

    // Enter = accept selected
    if (isEnterKey(key)) {
      const selected = items.filter((i) => i.checked);
      if (selected.length === 0) {
        setStatusMsg('select files with space first, or q to quit');
        return;
      }
      setPromptStatus('done');
      done(selected);
      return;
    }

    // Navigation
    if (key.ctrl && isUpKey(key)) {
      setActive(bounds.first);
      setStatusMsg('');
      return;
    }
    if (key.ctrl && isDownKey(key)) {
      setActive(bounds.last);
      setStatusMsg('');
      return;
    }
    if (isUpKey(key)) {
      setActive(active <= bounds.first ? bounds.first : active - 1);
      setStatusMsg('');
      return;
    }
    if (isDownKey(key)) {
      setActive(active >= bounds.last ? bounds.last : active + 1);
      setStatusMsg('');
      return;
    }

    // Space = toggle selection
    if (isSpaceKey(key)) {
      setItems(items.map((item, i) => (i === active ? { ...item, checked: !item.checked } : item)));
      return;
    }

    // d = show diff in terminal (blocks until pager exits)
    if (key.name === 'd') {
      showContribDiff(items[active], baseRef, cwd);
      setStatusMsg(`viewed ${items[active].path}`);
      return;
    }

    // a = select all files from same fork
    if (key.name === 'a') {
      const targetFork = items[active].fork;
      setItems(items.map((item) => (item.fork === targetFork ? { ...item, checked: true } : item)));
      setStatusMsg(`selected all from ${targetFork}`);
      return;
    }
  });

  // Render: done state
  if (promptStatus === 'done') {
    const checked = items.filter((i) => i.checked);
    if (checked.length > 0) {
      return `${pc.green('✓')} ${checked.length} files accepted`;
    }
    return `${pc.green('✓')} done`;
  }

  // Render: empty
  if (items.length === 0) {
    return `${pc.green('✓')} no contributions — press enter`;
  }

  // Render: paginated list
  const checkedCount = items.filter((i) => i.checked).length;
  const forkCount = new Set(items.map((i) => i.fork)).size;

  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive }) {
      const checkbox = item.checked ? pc.green('●') : pc.dim('○');
      const cursor = isActive ? pc.cyan('❯') : ' ';
      const forkLabel = pc.dim(` (${item.fork})`);
      const delLabel = item.deleted ? pc.yellow(' [del]') : '';
      const statusTag = item.status === 'diverged' ? pc.yellow(' ⚠ diverged') : '';
      const dateLabel = item.changedAt ? pc.dim(` · ${item.changedAt}`) : '';
      const line = `${cursor} ${checkbox} ${item.path}${delLabel}${statusTag}${forkLabel}${dateLabel}`;
      return isActive ? pc.cyan(line) : line;
    },
    pageSize,
    loop: false,
  });

  const countInfo =
    checkedCount > 0
      ? `${items.length} files from ${forkCount} fork${forkCount > 1 ? 's' : ''}, ${pc.green(`${checkedCount} selected`)}`
      : `${items.length} files from ${forkCount} fork${forkCount > 1 ? 's' : ''}`;
  const header = `${pc.cyan('⬇')} ${config.message} ${pc.dim(`(${countInfo})`)}`;

  const keys: [string, string][] = [
    ['↑↓', 'navigate'],
    ['d', 'diff'],
    ['a', 'select fork'],
    ['space', 'select'],
    ['⏎', 'accept'],
    ['q', 'quit'],
  ];
  const helpLine = keys.map(([k, a]) => `${pc.bold(k)} ${pc.dim(a)}`).join(pc.dim(' · '));

  const statusLine = statusMsg ? `  ${pc.dim(statusMsg)}` : '';

  const lines = [header, page, statusLine, helpLine].filter(Boolean).join('\n').trimEnd();
  return `${lines}\x1B[?25l`;
});

// ── Fork pulling ─────────────────────────────────────────────────────────────

/**
 * Fetch a fork's pullBranch into cella's object store and return the commit sha.
 */
async function fetchForkBranch(cellaPath: string, forkPath: string, pullBranch: string): Promise<string> {
  await git(['fetch', forkPath, pullBranch], cellaPath);
  return git(['rev-parse', 'FETCH_HEAD'], cellaPath);
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run the contributions service.
 *
 * Based on the configured `forks`, lets the user select one or more forks,
 * pulls each fork's `pullBranch`, builds clean local `contrib/<fork>` branches,
 * then presents an interactive TUI to review and adopt individual files.
 */
export async function runContributions(config: RuntimeConfig): Promise<void> {
  const forks = config.forks ?? [];

  if (forks.length === 0) {
    printNoForksHint('add forks to pull contributions from:');
    return;
  }

  // Compare forks against cella's currently checked-out branch, not a fixed
  // configured branch, so contributions reflect the branch you're working on.
  const baseRef = await getCurrentBranch(config.forkPath);

  // Warn when not on the regular working branch. The comparison is a 3-way
  // analysis against merge-base(baseRef, fork), so a long-lived feature branch
  // has an older merge-base than '<workingBranch>' and may surface extra
  // 'diverged' files that would show clean from the working branch.
  const workingBranch = config.settings.workingBranch;
  if (baseRef !== workingBranch) {
    console.info(
      `${warningMark} ${pc.yellow(`not on working branch '${workingBranch}'`)} ${pc.dim(`comparing forks against '${baseRef}'`)}`,
    );
    console.info(
      `  ${pc.dim(`older merge-base may show extra 'diverged' files; switch to '${workingBranch}' for the cleanest result`)}`,
    );
    console.info('');
  }

  const validated = forks.map((fork) => validateForkPath(fork, config.forkPath));

  // Select which forks to pull from
  let selectedForks: ValidatedFork[];
  if (config.fork) {
    const match = validated.find((v) => v.fork.name === config.fork);
    if (!match?.valid) {
      console.error(pc.red(`fork '${config.fork}' not found or invalid in config`));
      return;
    }
    selectedForks = [match];
  } else if (config.list) {
    // Non-interactive: pull from all valid forks
    selectedForks = validated.filter((v) => v.valid);
  } else {
    const choices = validated.map((v) => ({
      value: v.fork.name,
      name: v.valid
        ? `${v.fork.name}  ${pc.dim(`[${v.fork.pullBranch}] ${v.fork.localPath}`)}`
        : `${v.fork.name}  ${pc.dim(v.fork.localPath)}`,
      disabled: v.valid ? false : (v.error ?? 'invalid'),
      checked: v.valid,
    }));
    const picked = await checkbox<string>({
      message: 'select forks to pull contributions from:',
      choices,
      loop: false,
    });
    if (picked.length === 0) {
      console.info(pc.dim('no forks selected.'));
      return;
    }
    selectedForks = validated.filter((v) => v.valid && picked.includes(v.fork.name));
  }

  // Pull each fork and build a clean contrib/<fork> branch
  createSpinner('pulling fork contributions...');
  const allItems: ContribItem[] = [];
  const buildErrors: string[] = [];

  for (const { fork, resolvedPath } of selectedForks) {
    try {
      const forkRef = await fetchForkBranch(config.forkPath, resolvedPath, fork.pullBranch);

      // Read the fork's own owned folders so its fork-specific modules aren't offered back
      let forkTerritory: string[] = [];
      try {
        const forkConfig = await loadConfig(resolvedPath);
        forkTerritory = forkConfig.overrides?.ignoredFolders ?? [];
      } catch {
        // Fork may not have a cella.config.ts — no extra territory to exclude
      }

      const detection = await detectContributableFiles(config.forkPath, baseRef, forkRef, config, forkTerritory);
      if (countDetection(detection) === 0) continue;

      const { branch, appliedFiles } = await buildContribBranch(
        config.forkPath,
        baseRef,
        forkRef,
        detection,
        fork.name,
      );
      if (appliedFiles.length === 0) continue;

      const metaByPath = new Map(detection.files.map((f) => [f.path, f]));
      for (const path of [...detection.modified, ...detection.created]) {
        const meta = metaByPath.get(path);
        allItems.push({
          path,
          fork: fork.name,
          ref: branch,
          deleted: false,
          status: meta?.status,
          changedAt: meta?.changedAt,
          checked: false,
        });
      }
      for (const path of detection.deleted) {
        const meta = metaByPath.get(path);
        allItems.push({
          path,
          fork: fork.name,
          ref: branch,
          deleted: true,
          status: meta?.status,
          changedAt: meta?.changedAt,
          checked: false,
        });
      }
    } catch (error) {
      buildErrors.push(`${fork.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  if (buildErrors.length > 0) {
    spinnerFail(`failed to pull ${buildErrors.length} fork(s)`);
    for (const e of buildErrors) console.info(pc.red(`  ✗ ${e}`));
  }

  if (allItems.length === 0) {
    spinnerSuccess('no contributions found');
    return;
  }

  // Sort by path, then by fork
  allItems.sort((a, b) => a.path.localeCompare(b.path) || a.fork.localeCompare(b.fork));

  const forkCount = new Set(allItems.map((i) => i.fork)).size;
  spinnerSuccess(`${allItems.length} files from ${forkCount} fork${forkCount > 1 ? 's' : ''}`);

  // Non-interactive mode: output plain list for LLM/agent usage
  if (config.list) {
    for (const item of allItems) {
      console.info(`${item.fork}\t${item.path}`);
    }
    return;
  }

  console.info();
  console.info(DIVIDER);

  // Run interactive prompt
  const selected = await contribPrompt({
    message: 'contributions from forks',
    items: allItems,
    baseRef,
    cwd: config.forkPath,
    pageSize: 20,
  });

  if (selected.length === 0) {
    console.info();
    return;
  }

  // Apply selected files into the working tree
  createSpinner(`applying ${selected.length} files...`);

  let applied = 0;
  const errors: string[] = [];

  for (const item of selected) {
    try {
      // Reject paths with traversal components (CWE-22)
      if (item.path.includes('..') || item.path.startsWith('/')) {
        errors.push(`${item.path}: rejected (path traversal)`);
        continue;
      }
      if (item.deleted) {
        await git(['rm', '-f', '--', item.path], config.forkPath, { ignoreErrors: true });
      } else {
        await git(['checkout', item.ref, '--', item.path], config.forkPath);
      }
      applied++;
    } catch (error) {
      errors.push(`${item.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  if (errors.length > 0) {
    spinnerFail(`applied ${applied}/${selected.length} files (${errors.length} errors)`);
    for (const err of errors) {
      console.info(pc.red(`  ✗ ${err}`));
    }
  } else {
    spinnerSuccess(`applied ${applied} files (staged)`);
  }

  // Show summary grouped by fork
  console.info();
  const byFork = new Map<string, string[]>();
  for (const item of selected) {
    const existing = byFork.get(item.fork) || [];
    existing.push(item.deleted ? `(deleted) ${item.path}` : item.path);
    byFork.set(item.fork, existing);
  }

  for (const [fork, files] of byFork) {
    console.info(`  ${pc.cyan(fork)} ${pc.dim(`(${files.length} files)`)}`);
    for (const f of files) {
      console.info(`    ${pc.dim('→')} ${f}`);
    }
  }

  console.info();
  console.info(pc.dim('  files are staged — review and commit when ready'));
  console.info();
}
