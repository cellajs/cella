/**
 * Inspect service for sync CLI v2.
 *
 * Single-screen interactive review of drifted files with inline key actions:
 * d = VS Code diff, t = terminal diff, p = pin, space = select, enter = done.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
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
import type { AnalyzedFile, RuntimeConfig } from '../config/types';
import { createSpinner, DIVIDER, showDiffInPager, spinnerSuccess, spinnerText } from '../utils/display';
import { pushContribBranch } from './contribute';
import { runMergeEngine } from './merge-engine';

/** Track temp directories for cleanup on process exit */
const tempCleanupDirs: string[] = [];
process.on('exit', () => {
  for (const dir of tempCleanupDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

// ── Types ────────────────────────────────────────────────────────────────────

interface InspectItem {
  path: string;
  file: AnalyzedFile;
  checked: boolean;
}

interface InspectPromptConfig {
  message: string;
  items: InspectItem[];
  runtimeConfig: RuntimeConfig;
  pageSize?: number;
}

// ── Sync helpers (called inside keypress handler) ────────────────────────────

/**
 * Open VS Code diff between upstream and fork versions of a file.
 * Non-blocking — VS Code opens in background.
 */
function openVsCodeDiff(file: AnalyzedFile, config: RuntimeConfig): void {
  const forkFile = resolve(config.forkPath, file.path);

  if (config.settings.upstreamLocalPath) {
    const upstreamFile = resolve(config.forkPath, config.settings.upstreamLocalPath, file.path);
    spawnSync('code', ['--diff', upstreamFile, forkFile], { stdio: 'ignore' });
  } else {
    // Extract upstream version from git ref to temp file
    const tmpDir = mkdtempSync(join(tmpdir(), 'cella-diff-'));
    tempCleanupDirs.push(tmpDir);
    const fileName = file.path.split('/').pop() || 'file';
    const tmpFile = join(tmpDir, `upstream-${fileName}`);

    const result = spawnSync('git', ['show', `${config.upstreamRef}:${file.path}`], {
      cwd: config.forkPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      writeFileSync(tmpFile, result.stdout);
      spawnSync('code', ['--diff', tmpFile, forkFile], { stdio: 'ignore' });
    }
  }
}

/**
 * Show diff in terminal using less (or bat if available).
 * Blocks until user exits the pager. Clears screen on return so inquirer re-renders cleanly.
 */
function showTerminalDiff(file: AnalyzedFile, config: RuntimeConfig): void {
  const forkName = basename(config.forkPath);
  const upstreamName = config.settings.upstreamUrl.replace(/.*\/([^/.]+?)(?:\.git)?$/, '$1');

  const diffResult = spawnSync(
    'git',
    [
      'diff',
      '--color=always',
      `--src-prefix=${upstreamName}/`,
      `--dst-prefix=${forkName}/`,
      `${config.upstreamRef}..HEAD`,
      '--',
      file.path,
    ],
    { cwd: config.forkPath },
  );

  showDiffInPager(diffResult.stdout);
}

/**
 * Pin a single file by adding it to the pinned list in cella.config.ts.
 */
function pinSingleFile(file: AnalyzedFile, config: RuntimeConfig): boolean {
  const configPath = resolve(config.forkPath, 'cella.config.ts');
  // Validate config path stays within fork directory (CWE-22)
  if (!configPath.startsWith(resolve(config.forkPath))) return false;
  if (!existsSync(configPath)) return false;
  const content = readFileSync(configPath, 'utf-8');

  const pinnedMatch = content.match(/(pinned:\s*\[[\s\S]*?)(])/);
  if (!pinnedMatch) return false;

  const newPin = `      "${file.path}"`;
  const trimmed = pinnedMatch[1].trimEnd();
  const needsComma = trimmed.endsWith('"') || trimmed.endsWith("'");

  const updatedContent = content.replace(pinnedMatch[0], `${trimmed}${needsComma ? ',' : ''}\n${newPin}\n    ]`);
  writeFileSync(configPath, updatedContent, 'utf-8');
  return true;
}

// ── Custom prompt ────────────────────────────────────────────────────────────

/**
 * Single-screen inspect prompt with inline key actions.
 * Returns paths of files checked (☑) for upstream contribution.
 */
const inspectPrompt = createPrompt<string[], InspectPromptConfig>((config, done) => {
  const { pageSize = 20, runtimeConfig } = config;

  const [items, setItems] = useState<InspectItem[]>(config.items);
  const [active, setActive] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [promptStatus, setPromptStatus] = useState<'idle' | 'done'>('idle');

  const bounds = useMemo(() => {
    if (items.length === 0) return { first: 0, last: 0 };
    return { first: 0, last: items.length - 1 };
  }, [items]);

  useKeypress(async (key) => {
    // Nothing to do if list is empty
    if (items.length === 0) {
      if (isEnterKey(key) || key.name === 'q') {
        setPromptStatus('done');
        done([]);
      }
      return;
    }

    // q = quit without doing anything
    if (key.name === 'q') {
      setPromptStatus('done');
      done([]);
      return;
    }

    // Enter = finish, only when files are selected
    if (isEnterKey(key)) {
      const hasSelection = items.some((i) => i.checked);
      if (!hasSelection) {
        setStatusMsg('select files with space first, or q to quit');
        return;
      }
      setPromptStatus('done');
      done(items.filter((i) => i.checked).map((i) => i.path));
      return;
    }

    // Ctrl+Up / Ctrl+Down = jump to top / bottom
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

    // Navigation (no loop — stop at bounds)
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

    // Space = toggle selection for contribute batch
    if (isSpaceKey(key)) {
      setItems(items.map((item, i) => (i === active ? { ...item, checked: !item.checked } : item)));
      return;
    }

    // d = open VS Code diff (non-blocking)
    if (key.name === 'd') {
      openVsCodeDiff(items[active].file, runtimeConfig);
      setStatusMsg(`opened ${items[active].path} in VS Code`);
      return;
    }

    // t = terminal diff (blocks until pager exits)
    if (key.name === 't') {
      showTerminalDiff(items[active].file, runtimeConfig);
      setStatusMsg(`viewed ${items[active].path}`);
      return;
    }

    // p = pin file immediately, remove from list
    if (key.name === 'p') {
      const item = items[active];
      const pinned = pinSingleFile(item.file, runtimeConfig);
      const newItems = items.filter((_, i) => i !== active);

      if (newItems.length === 0) {
        setPromptStatus('done');
        done([]);
        return;
      }

      setItems(newItems);
      setActive(Math.min(active, newItems.length - 1));
      setStatusMsg(pinned ? `pinned ${item.path}` : `failed to pin ${item.path}`);
      return;
    }
  });

  // Render: done state
  if (promptStatus === 'done') {
    const checked = items.filter((i) => i.checked);
    if (checked.length > 0) {
      return `${pc.green('✓')} ${checked.length} files selected for contribution`;
    }
    return `${pc.green('✓')} done`;
  }

  // Render: empty state (all files pinned)
  if (items.length === 0) {
    return `${pc.green('✓')} all files handled — press enter`;
  }

  // Render: paginated list
  const checkedCount = items.filter((i) => i.checked).length;

  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive }) {
      const checkbox = item.checked ? pc.green('●') : pc.dim('○');
      const cursor = isActive ? pc.cyan('❯') : ' ';
      const label = item.path + (item.file.changedAt ? pc.dim(` · ${item.file.changedAt}`) : '');
      const line = `${cursor} ${checkbox} ${label}`;
      return isActive ? pc.cyan(line) : line;
    },
    pageSize,
    loop: false,
  });

  // Header with file count and selection info
  const countInfo =
    checkedCount > 0 ? `${items.length} files, ${pc.green(`${checkedCount} selected`)}` : `${items.length} files`;
  const header = `${pc.yellow('⚠')} ${config.message} ${pc.dim(`(${countInfo})`)}`;

  // Keyboard shortcuts help
  const keys: [string, string][] = [
    ['↑↓', 'navigate'],
    ['d', 'vscode diff'],
    ['t', 'terminal diff'],
    ['p', 'pin'],
    ['space', 'select'],
    ['⏎', 'contribute'],
    ['q', 'quit'],
  ];
  const helpLine = keys.map(([k, a]) => `${pc.bold(k)} ${pc.dim(a)}`).join(pc.dim(' · '));

  // Status message (e.g., "pinned foo.ts", "opened bar.ts in VS Code")
  const statusLine = statusMsg ? `  ${pc.dim(statusMsg)}` : '';

  const lines = [header, page, statusLine, helpLine].filter(Boolean).join('\n').trimEnd();
  return `${lines}\x1B[?25l`;
});

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run the inspect service.
 *
 * Analyzes the fork for drifted files and presents a single-screen interactive
 * prompt with inline key actions for reviewing, diffing, pinning, and contributing.
 */
export async function runInspect(config: RuntimeConfig): Promise<void> {
  createSpinner('analyzing drift...');

  // Run the merge engine in analyze mode to get drifted files
  const result = await runMergeEngine(config, {
    apply: false,
    onProgress: (message) => spinnerText(message),
    onStep: (label, detail) => {
      spinnerSuccess(label, detail);
      createSpinner('...');
    },
  });

  spinnerSuccess();

  const driftedFiles = result.files.filter((f) => f.status === 'drifted' || f.status === 'diverged');

  if (driftedFiles.length === 0) {
    console.info();
    console.info(`${pc.green('✓')} no drifted or diverged files — all fork changes are pinned or ignored`);
    return;
  }

  // Non-interactive mode: output plain list for LLM/agent usage
  if (config.list) {
    for (const f of driftedFiles) {
      console.info(f.path);
    }
    return;
  }

  console.info();
  console.info(DIVIDER);

  // Run the custom inspect prompt
  const selectedPaths = await inspectPrompt({
    message: 'drifted / diverged from upstream',
    items: driftedFiles.map((f) => ({ path: f.path, file: f, checked: false })),
    runtimeConfig: config,
    pageSize: 20,
  });

  // Push selected files to contrib branch
  if (selectedPaths.length > 0) {
    const selectedFiles = driftedFiles.filter((f) => selectedPaths.includes(f.path));
    await pushContribBranch(selectedFiles, config);
  }

  console.info();
}
