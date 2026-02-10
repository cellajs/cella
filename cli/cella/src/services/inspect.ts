/**
 * Inspect service for sync CLI v2.
 *
 * Single-screen interactive review of drifted files with inline key actions:
 * d = VS Code diff, t = terminal diff, p = pin, space = select, enter = done.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
import { confirm, input } from '@inquirer/prompts';
import pc from 'picocolors';
import type { AnalyzedFile, RuntimeConfig } from '../config/types';
import { createSpinner, DIVIDER, resetSteps, spinnerSuccess, spinnerText } from '../utils/display';
import { git } from '../utils/git';
import { runMergeEngine } from './merge-engine';

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
  const hasBat = spawnSync('which', ['bat'], { stdio: 'pipe' }).status === 0;

  const diffResult = spawnSync(
    'git',
    ['diff', hasBat ? '--color=never' : '--color=always', `${config.upstreamRef}..HEAD`, '--', file.path],
    { cwd: config.forkPath },
  );

  if (diffResult.stdout.length === 0) return;

  // Show cursor before handing off to pager
  process.stdout.write('\x1B[?25h');

  if (hasBat) {
    spawnSync('bat', ['--language', 'diff', '--paging', 'always', '--style', 'plain'], {
      input: diffResult.stdout,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } else {
    spawnSync('less', ['-R'], {
      input: diffResult.stdout,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }

  // Clear screen so inquirer re-renders cleanly after pager exit
  process.stdout.write('\x1B[2J\x1B[0;0H');
}

/**
 * Pin a single file by adding it to the pinned list in cella.config.ts.
 */
function pinSingleFile(file: AnalyzedFile, config: RuntimeConfig): boolean {
  const configPath = resolve(config.forkPath, 'cella.config.ts');
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
      return `${pc.green('✓')} ${checked.length} files selected for upstream PR`;
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
    ['⏎', 'add to pr'],
    ['q', 'quit'],
  ];
  const helpLine = keys.map(([k, a]) => `${pc.bold(k)} ${pc.dim(a)}`).join(pc.dim(' · '));

  // Status message (e.g., "pinned foo.ts", "opened bar.ts in VS Code")
  const statusLine = statusMsg ? `  ${pc.dim(statusMsg)}` : '';

  const lines = [header, page, statusLine, helpLine].filter(Boolean).join('\n').trimEnd();
  return `${lines}\x1B[?25l`;
});

// ── Contribute upstream ──────────────────────────────────────────────────────

/**
 * Contribute selected files to upstream as a draft PR.
 * Copies fork versions into the upstream local clone on a new branch.
 */
async function contributeUpstream(files: AnalyzedFile[], config: RuntimeConfig): Promise<void> {
  const upstreamLocalPath = config.settings.upstreamLocalPath;

  if (!upstreamLocalPath) {
    console.info();
    console.info(pc.red('✗ upstreamLocalPath not configured in cella.config.ts'));
    console.info(pc.dim('  add upstreamLocalPath to settings to enable contributing upstream.'));
    return;
  }

  const upstreamPath = resolve(config.forkPath, upstreamLocalPath);

  if (!existsSync(upstreamPath)) {
    console.info();
    console.info(pc.red(`✗ upstream path not found: ${upstreamPath}`));
    return;
  }

  const forkName = basename(config.forkPath);

  // Prompt for branch name
  const defaultBranch = `fork/${forkName}/drift-${Date.now().toString(36).slice(-4)}`;
  const branchName = await input({
    message: 'branch name:',
    default: defaultBranch,
  });

  // Prompt for commit message
  const defaultMessage = `feat: apply improvements from ${forkName} fork`;
  const commitMessage = await input({
    message: 'commit message:',
    default: defaultMessage,
  });

  console.info();

  try {
    const upstreamBranch = config.settings.upstreamBranch;
    const currentBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], upstreamPath);

    if (currentBranch !== upstreamBranch) {
      console.info(pc.yellow(`  ⚠ upstream on '${currentBranch}', switching to '${upstreamBranch}'...`));
      await git(['checkout', upstreamBranch], upstreamPath);
    }

    await git(['pull', '--ff-only'], upstreamPath, { ignoreErrors: true });

    await git(['checkout', '-b', branchName], upstreamPath);
    console.info(`${pc.green('✓')} created branch ${pc.cyan(branchName)}`);

    // Copy files from fork to upstream
    for (const file of files) {
      const src = join(config.forkPath, file.path);
      const dest = join(upstreamPath, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      console.info(`  ${pc.dim('→')} ${file.path}`);
    }

    createSpinner('committing...');
    await git(['add', ...files.map((f) => f.path)], upstreamPath);
    try {
      await git(['commit', '-m', commitMessage], upstreamPath);
    } catch (commitError) {
      spinnerSuccess('commit blocked by pre-commit hook');
      console.info(pc.dim('  files may not compile in upstream context'));
      const forceCommit = await confirm({
        message: 'force commit with --no-verify?',
        default: false,
      });
      if (!forceCommit) {
        await git(['checkout', config.settings.upstreamBranch], upstreamPath);
        await git(['branch', '-D', branchName], upstreamPath, { ignoreErrors: true });
        return;
      }
      createSpinner('committing (force)...');
      await git(['commit', '--no-verify', '-m', commitMessage], upstreamPath);
    }
    spinnerSuccess(`committed ${files.length} files`);

    const shouldPush = await confirm({
      message: 'push branch and create draft PR?',
      default: true,
    });

    if (shouldPush) {
      createSpinner('pushing...');
      await git(['push', '-u', 'origin', branchName], upstreamPath);
      spinnerSuccess(`pushed to origin/${branchName}`);

      // Try creating PR with gh CLI
      const hasGh = spawnSync('which', ['gh'], { stdio: 'pipe' }).status === 0;
      if (hasGh) {
        createSpinner('creating draft PR...');
        const prResult = spawnSync(
          'gh',
          [
            'pr',
            'create',
            '--draft',
            '--title',
            commitMessage,
            '--body',
            `Files contributed from \`${forkName}\` fork:\n\n${files.map((f) => `- \`${f.path}\``).join('\n')}`,
          ],
          { cwd: upstreamPath, stdio: 'pipe' },
        );
        if (prResult.status === 0) {
          const prUrl = prResult.stdout.toString().trim();
          spinnerSuccess(`draft PR created${prUrl ? ` · ${prUrl}` : ''}`);
        } else {
          spinnerSuccess('PR creation failed — push succeeded, create PR manually');
        }
      } else {
        console.info(pc.dim('  tip: install gh CLI to auto-create PRs'));
      }
    }

    await git(['checkout', upstreamBranch], upstreamPath);
  } catch (error) {
    console.info(pc.red(`✗ ${error instanceof Error ? error.message : error}`));
    try {
      await git(['checkout', config.settings.upstreamBranch], upstreamPath);
    } catch {
      // ignore
    }
  }
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run the inspect service.
 *
 * Analyzes the fork for drifted files and presents a single-screen interactive
 * prompt with inline key actions for reviewing, diffing, pinning, and contributing.
 */
export async function runInspect(config: RuntimeConfig): Promise<void> {
  resetSteps();
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

  const driftedFiles = result.files.filter((f) => f.status === 'drifted');

  if (driftedFiles.length === 0) {
    console.info();
    console.info(`${pc.green('✓')} no drifted files — all fork changes are pinned or ignored`);
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
    message: 'drifted from upstream',
    items: driftedFiles.map((f) => ({ path: f.path, file: f, checked: false })),
    runtimeConfig: config,
    pageSize: 20,
  });

  // If files were selected, offer to contribute upstream
  if (selectedPaths.length > 0) {
    const selectedFiles = driftedFiles.filter((f) => selectedPaths.includes(f.path));

    console.info();
    const shouldContribute = await confirm({
      message: `add ${selectedFiles.length} files to a draft PR for upstream?`,
      default: true,
    });

    if (shouldContribute) {
      await contributeUpstream(selectedFiles, config);
    }
  }

  console.info();
}
