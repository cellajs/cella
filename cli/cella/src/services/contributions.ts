/**
 * Contributions service for sync CLI.
 *
 * Upstream-side (cella): based on the configured `forks`, lets the user pick a
 * single fork, pulls its `pullBranch` and builds a clean local `contrib/<fork>`
 * branch with only that fork's contributed files. Then shows an interactive TUI
 * to review and adopt individual files into the working tree.
 */

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
import { select } from '@inquirer/prompts';
import type { FileStatus, RuntimeConfig } from '../config/types';
import pc from '../utils/colors';
import { DEFAULT_BRANCH, loadConfig } from '../utils/config';
import { gitDiffFile } from '../utils/diff';
import {
  createSpinner,
  DIVIDER,
  showDiffInPager,
  spinnerFail,
  spinnerSuccess,
  warningMark,
  writeStdout,
} from '../utils/display';
import { getCurrentBranch, git } from '../utils/git';
import { buildContribBranch, countDetection, detectContributableFiles } from './contrib-core';
import { printNoForksHint, type ValidatedFork, validateForkPath } from './fork-utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface ContribItem {
  /** File path relative to repo root */
  path: string;
  /** Local contrib branch ref (e.g., contrib/myfork) */
  ref: string;
  /** True if adopting this means deleting the file in cella */
  deleted: boolean;
  /** True if the file does not exist in cella yet (adopting it creates a new file) */
  created?: boolean;
  /** Analyzer status from cella's POV (behind = fork ahead, diverged = both changed) */
  status?: FileStatus;
  /** Relative date of the fork's change (e.g. '3 days ago') */
  changedAt?: string;
  /** Lines added in the fork vs cella base (null for binary files) */
  additions?: number | null;
  /** Lines removed in the fork vs cella base (null for binary files) */
  deletions?: number | null;
  /** Whether file is selected for acceptance */
  checked: boolean;
}

interface ContribPromptConfig {
  message: string;
  items: ContribItem[];
  /** Name of the fork being reviewed (used to label diffs cella/ vs <fork>/) */
  forkName: string;
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
function showContribDiff(item: ContribItem, baseRef: string, cwd: string, forkName: string): void {
  const diff = gitDiffFile(cwd, `${baseRef}..${item.ref}`, item.path, { dstPrefix: forkName, color: 'always' });
  showDiffInPager(diff);
}

// ── Custom prompt ────────────────────────────────────────────────────────────

/**
 * Interactive prompt for reviewing contributed files.
 * Returns items selected for acceptance.
 */
const contribPrompt = createPrompt<ContribItem[], ContribPromptConfig>((config, done) => {
  const { pageSize = 20, baseRef, cwd, forkName } = config;

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
      showContribDiff(items[active], baseRef, cwd, forkName);
      setStatusMsg(`viewed ${items[active].path}`);
      return;
    }

    // a = toggle all (select all, or deselect all if already all selected)
    if (key.name === 'a') {
      const allChecked = items.every((item) => item.checked);
      setItems(items.map((item) => ({ ...item, checked: !allChecked })));
      setStatusMsg(allChecked ? 'deselected all' : 'selected all');
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

  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive }) {
      const checkbox = item.checked ? pc.green('●') : pc.dim('○');
      const cursor = isActive ? pc.cyan('❯') : ' ';
      const newLabel = item.created ? pc.yellow(' · not in cella') : '';
      const delLabel = item.deleted ? pc.yellow(' [del]') : '';
      const statusTag = item.status === 'diverged' ? pc.yellow(' ⚠ diverged') : '';
      const dateLabel = item.changedAt ? pc.dim(` · ${item.changedAt}`) : '';
      const line = `${cursor} ${checkbox} ${item.path}${delLabel}${statusTag}${newLabel}${dateLabel}`;
      return isActive ? pc.cyan(line) : line;
    },
    pageSize,
    loop: false,
  });

  const countInfo =
    checkedCount > 0 ? `${items.length} files, ${pc.green(`${checkedCount} selected`)}` : `${items.length} files`;
  const header = `${pc.cyan('⬇')} ${config.message} ${pc.dim(`(${countInfo})`)}`;

  const keys: [string, string][] = [
    ['↑↓', 'navigate'],
    ['d', 'diff'],
    ['a', '(de)select all'],
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
async function fetchForkBranch(cellaPath: string, fetchSource: string, pullBranch: string): Promise<string> {
  await git(['fetch', fetchSource, pullBranch], cellaPath);
  return git(['rev-parse', 'FETCH_HEAD'], cellaPath);
}

/** Short sha + relative date of the fork's committed pullBranch HEAD (for the comparison banner). */
async function forkRefMeta(cellaPath: string, forkRef: string): Promise<{ sha: string; date: string }> {
  const out = await git(['log', '-1', '--format=%h%x09%cr', forkRef], cellaPath, { ignoreErrors: true });
  const [sha = forkRef.slice(0, 7), date = 'unknown'] = out.split('\t');
  return { sha, date };
}

/**
 * Lines added/removed per file between cella base and the contrib branch.
 * Binary files report null. Used to enrich `--json` output for triage.
 */
async function diffStat(
  cellaPath: string,
  baseRef: string,
  ref: string,
): Promise<Map<string, { additions: number | null; deletions: number | null }>> {
  const out = await git(['diff', '--numstat', `${baseRef}..${ref}`], cellaPath, { ignoreErrors: true });
  const stat = new Map<string, { additions: number | null; deletions: number | null }>();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [a, d, ...rest] = line.split('\t');
    const path = rest.join('\t');
    if (!path) continue;
    stat.set(path, {
      additions: a === '-' ? null : Number(a),
      deletions: d === '-' ? null : Number(d),
    });
  }
  return stat;
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

  // Warn when not on cella's base branch. The comparison is a 3-way analysis against
  // merge-base(baseRef, fork), so a long-lived feature branch has an older merge-base
  // than 'main' and may surface extra 'diverged' files that would show clean from main.
  if (baseRef !== DEFAULT_BRANCH) {
    console.info(
      `${warningMark} ${pc.yellow(`not on base branch '${DEFAULT_BRANCH}'`)} ${pc.dim(`comparing forks against '${baseRef}'`)}`,
    );
    console.info(
      `  ${pc.dim(`older merge-base may show extra 'diverged' files; switch to '${DEFAULT_BRANCH}' for the cleanest result`)}`,
    );
    console.info('');
  }

  const validated = forks.map((fork) => validateForkPath(fork, config.forkPath));
  const validForks = validated.filter((v) => v.valid);

  // Select a single fork to pull from
  let selectedFork: ValidatedFork | undefined;
  if (config.fork) {
    const match = validated.find((v) => v.fork.name === config.fork);
    if (!match?.valid) {
      console.error(pc.red(`fork '${config.fork}' not found or invalid in config`));
      return;
    }
    selectedFork = match;
  } else if (config.list || config.json || config.diff) {
    // Non-interactive: require an explicit --fork when multiple forks are configured
    if (validForks.length === 0) {
      console.error(pc.red('no valid forks configured'));
      return;
    }
    if (validForks.length > 1) {
      console.error(pc.red('multiple forks configured; pass --fork <name> to choose one'));
      return;
    }
    selectedFork = validForks[0];
  } else {
    const choices = validated.map((v) => ({
      value: v.fork.name,
      name: v.valid
        ? `${v.fork.name}  ${pc.dim(`[${v.fork.pullBranch}] ${v.fork.localPath}`)}`
        : `${v.fork.name}  ${pc.dim(v.fork.localPath)}`,
      disabled: v.valid ? false : (v.error ?? 'invalid'),
    }));
    const picked = await select<string>({
      message: 'select fork to pull contributions from:',
      choices,
      loop: false,
    });
    selectedFork = validated.find((v) => v.fork.name === picked);
  }

  if (!selectedFork) {
    console.info(pc.dim('no fork selected.'));
    return;
  }

  const { fork, resolvedPath } = selectedFork;
  const forkName = fork.name;

  // Pull the fork and build a clean contrib/<fork> branch
  createSpinner('pulling fork contributions...');
  const allItems: ContribItem[] = [];
  let forkBanner: { pullBranch: string; sha: string; date: string } | null = null;

  try {
    // Prefer the fork's remote (authoritative committed ref) over the local clone.
    const fetchSource = fork.remoteUrl ?? resolvedPath;
    const forkRef = await fetchForkBranch(config.forkPath, fetchSource, fork.pullBranch);
    const meta = await forkRefMeta(config.forkPath, forkRef);
    forkBanner = { pullBranch: fork.pullBranch, sha: meta.sha, date: meta.date };

    // Read the fork's own owned folders so its fork-specific modules aren't offered back
    let forkTerritory: string[] = [];
    try {
      const forkConfig = await loadConfig(resolvedPath);
      forkTerritory = forkConfig.overrides?.ignored ?? [];
    } catch {
      // Fork may not have a cella.config.ts — no extra territory to exclude
    }

    const detection = await detectContributableFiles(config.forkPath, baseRef, forkRef, config, forkTerritory);
    if (countDetection(detection) > 0) {
      const { branch, appliedFiles } = await buildContribBranch(config.forkPath, baseRef, forkRef, detection, forkName);
      if (appliedFiles.length > 0) {
        const stat = await diffStat(config.forkPath, baseRef, branch);
        const metaByPath = new Map(detection.files.map((f) => [f.path, f]));
        for (const path of [...detection.modified, ...detection.created]) {
          const fileMeta = metaByPath.get(path);
          allItems.push({
            path,
            ref: branch,
            deleted: false,
            created: fileMeta?.kind === 'created',
            status: fileMeta?.status,
            changedAt: fileMeta?.changedAt,
            additions: stat.get(path)?.additions ?? null,
            deletions: stat.get(path)?.deletions ?? null,
            checked: false,
          });
        }
        for (const path of detection.deleted) {
          const fileMeta = metaByPath.get(path);
          allItems.push({
            path,
            ref: branch,
            deleted: true,
            status: fileMeta?.status,
            changedAt: fileMeta?.changedAt,
            additions: stat.get(path)?.additions ?? null,
            deletions: stat.get(path)?.deletions ?? null,
            checked: false,
          });
        }
      }
    }
  } catch (error) {
    spinnerFail(`failed to pull ${forkName}`);
    console.info(pc.red(`  ✗ ${error instanceof Error ? error.message : 'unknown error'}`));
    return;
  }

  if (allItems.length === 0) {
    spinnerSuccess('no contributions found');
    return;
  }

  // Sort by path
  allItems.sort((a, b) => a.path.localeCompare(b.path));

  spinnerSuccess(`${allItems.length} files from ${forkName}`);

  // Make the comparison basis explicit: the fork is compared at its committed pullBranch HEAD,
  // not its working tree, so uncommitted fork edits never appear here. Skipped for --list/--diff
  // so their stdout stays clean for machine parsing.
  if (!config.list && !config.diff && forkBanner) {
    console.info(
      `  ${pc.dim(`${forkName}: comparing committed '${forkBanner.pullBranch}' @ ${forkBanner.sha} (${forkBanner.date}) — uncommitted fork changes are not included`)}`,
    );
  }

  // Print the unified diff for a single file, then exit (tooling/agent usage).
  if (config.diff) {
    const matches = allItems.filter((i) => i.path === config.diff);
    if (matches.length === 0) {
      console.error(pc.red(`no contribution found for path: ${config.diff}`));
      process.exitCode = 1;
      return;
    }
    for (const item of matches) {
      const diff = gitDiffFile(config.forkPath, `${baseRef}..${item.ref}`, item.path, { dstPrefix: forkName });
      writeStdout(diff.toString());
    }
    return;
  }

  // Machine-readable JSON output for tooling/agent usage
  if (config.json) {
    const out = allItems.map((item) => ({
      fork: forkName,
      path: item.path,
      status: item.status ?? null,
      kind: item.deleted ? 'deleted' : 'modified',
      changedAt: item.changedAt ?? null,
      additions: item.additions ?? null,
      deletions: item.deletions ?? null,
    }));
    writeStdout(JSON.stringify(out, null, 2));
    return;
  }

  // Non-interactive mode: output enriched list for LLM/agent usage.
  // Columns are tab-separated: fork, status, kind, changedAt, path.
  // Note: status reflects the fork's committed pullBranch HEAD vs cella's base
  // (behind = fork ahead, diverged = both changed), not the fork's working tree.
  if (config.list) {
    for (const item of allItems) {
      const status = item.status ?? 'behind';
      const kind = item.deleted ? 'deleted' : 'modified';
      const changedAt = item.changedAt ?? '-';
      console.info(`${forkName}\t${status}\t${kind}\t${changedAt}\t${item.path}`);
    }
    return;
  }

  console.info();
  console.info(DIVIDER);

  // Run interactive prompt
  const selected = await contribPrompt({
    message: `contributions from ${forkName}`,
    items: allItems,
    forkName,
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

  // Show summary of adopted files
  console.info();
  console.info(`  ${pc.cyan(forkName)} ${pc.dim(`(${selected.length} files)`)}`);
  for (const item of selected) {
    console.info(`    ${pc.dim('→')} ${item.deleted ? `(deleted) ${item.path}` : item.path}`);
  }

  console.info();
  console.info(pc.dim('  files are staged — review and commit when ready'));
  console.info();
}
