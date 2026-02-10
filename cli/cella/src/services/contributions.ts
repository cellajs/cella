/**
 * Contributions service for sync CLI.
 *
 * Upstream-side: fetches `contrib/*` branches pushed by forks,
 * shows an interactive TUI to review and accept individual files.
 * Forks push via `pushContribBranch()` in contribute.ts.
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
import pc from 'picocolors';
import type { RuntimeConfig } from '../config/types';
import { createSpinner, DIVIDER, showDiffInPager, spinnerFail, spinnerSuccess } from '../utils/display';
import { git } from '../utils/git';

// ── Types ────────────────────────────────────────────────────────────────────

interface ContribItem {
  /** File path relative to repo root */
  path: string;
  /** Fork name (extracted from branch name) */
  fork: string;
  /** Full remote branch ref (e.g., origin/contrib/raak) */
  ref: string;
  /** Whether file is selected for acceptance */
  checked: boolean;
}

interface ContribPromptConfig {
  message: string;
  items: ContribItem[];
  runtimeConfig: RuntimeConfig;
  pageSize?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch origin and list all contrib/* branches.
 * Returns array of { fork, ref } objects.
 */
async function listContribBranches(cwd: string): Promise<{ fork: string; ref: string }[]> {
  await git(['fetch', 'origin'], cwd, { ignoreErrors: true });

  const output = await git(['branch', '-r', '--list', 'origin/contrib/*'], cwd);
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((ref) => {
      // ref is like "origin/contrib/raak"
      const fork = ref.replace('origin/contrib/', '');
      return { fork, ref };
    });
}

/**
 * Get changed files for a contrib branch relative to the upstream branch.
 */
async function getContribFiles(ref: string, upstreamBranch: string, cwd: string): Promise<string[]> {
  const output = await git(['diff', '--name-only', `origin/${upstreamBranch}...${ref}`], cwd, { ignoreErrors: true });
  if (!output) return [];
  return output.split('\n').filter(Boolean);
}

/**
 * Show diff in terminal for a contrib file using a pager.
 */
function showContribDiff(item: ContribItem, upstreamBranch: string, cwd: string): void {
  const diffResult = spawnSync(
    'git',
    ['diff', '--color=always', `origin/${upstreamBranch}...${item.ref}`, '--', item.path],
    { cwd },
  );

  showDiffInPager(diffResult.stdout);
}

// ── Custom prompt ────────────────────────────────────────────────────────────

/**
 * Interactive prompt for reviewing contributed files.
 * Returns items selected for acceptance.
 */
const contribPrompt = createPrompt<ContribItem[], ContribPromptConfig>((config, done) => {
  const { pageSize = 20, runtimeConfig } = config;
  const upstreamBranch = runtimeConfig.settings.upstreamBranch;

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
      showContribDiff(items[active], upstreamBranch, runtimeConfig.forkPath);
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
      const line = `${cursor} ${checkbox} ${item.path}${forkLabel}`;
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

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run the contributions service.
 *
 * Fetches contrib/* branches from origin, aggregates contributed files,
 * and presents an interactive TUI for reviewing and accepting changes.
 */
export async function runContributions(config: RuntimeConfig): Promise<void> {
  createSpinner('fetching contributions...');

  const branches = await listContribBranches(config.forkPath);

  if (branches.length === 0) {
    spinnerSuccess('no contrib branches found');
    console.info();
    console.info(pc.dim('  forks push contributions via autoContribute or inspect service'));
    return;
  }

  // Gather files from each contrib branch
  const allItems: ContribItem[] = [];

  for (const { fork, ref } of branches) {
    const files = await getContribFiles(ref, config.settings.upstreamBranch, config.forkPath);
    for (const path of files) {
      allItems.push({ path, fork, ref, checked: false });
    }
  }

  if (allItems.length === 0) {
    spinnerSuccess('contrib branches found but no file changes');
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
    runtimeConfig: config,
    pageSize: 20,
  });

  if (selected.length === 0) {
    console.info();
    return;
  }

  // Apply selected files: checkout from contrib branch into working tree
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
      await git(['checkout', item.ref, '--', item.path], config.forkPath);
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
    existing.push(item.path);
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
