import pc from 'picocolors';

// Console formatting for the infra CLI and tasks. Vendored (no `shared`
// import) so the engine has zero workspace dependencies at runtime.

export { pc };

/** Green checkmark prefix for success messages */
export const checkMark = pc.bold(pc.greenBright('✔'));

/** Cross mark for error messages */
export const crossMark = pc.bold(pc.redBright('✖'));

/** Warning mark for non-fatal warnings */
export const warningMark = pc.bold(pc.yellowBright('⚠'));

/** Pencil mark for change notifications */
export const changeMark = pc.bold(pc.yellowBright('✎'));

/** Tilde mark for changed/evolved items */
export const tildeMark = pc.bold(pc.yellowBright('~'));

/** Thin line divider for console output (60 chars wide) */
export const DIVIDER = '─'.repeat(60);

/** Prints the shared CLI header with optional version and right-aligned label. */
export function printHeader(name: string, version?: string, right = ''): void {
  const visibleLeft = version ? `⧈ ${name} · v${version}` : `⧈ ${name}`;
  const padding = Math.max(1, 60 - visibleLeft.length - right.length);
  const left = version ? `${pc.cyan(`⧈ ${name}`)}${pc.dim(` · v${version}`)}` : pc.cyan(`⧈ ${name}`);
  console.info();
  console.info(`${left}${' '.repeat(padding)}${pc.cyan(right)}`);
  console.info(DIVIDER);
  console.info();
}

/** Promise-based delay used by poll/retry loops. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True when an animated spinner is appropriate: stderr is a TTY and the run is
 * not automated. Automation (INFRA_NON_INTERACTIVE, CI, GitHub Actions) and
 * piped output get a single static line.
 */
function spinnerEnabled(): boolean {
  return (
    Boolean(process.stderr.isTTY) &&
    process.env.INFRA_NON_INTERACTIVE !== '1' &&
    process.env.CI !== 'true' &&
    !process.env.GITHUB_ACTIONS
  );
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Run a silent async task while showing a spinner next to `label`, so a network
 * round-trip does not look like a freeze. Everything is written to stderr, so
 * stdout stays clean for machine output (e.g. `status --json`). Non-TTY or
 * automated runs print one `→ label` line and no animation. The line is always
 * cleared (success or throw), and the caller prints its own result.
 *
 * Only wrap tasks that produce no output of their own: a task that logs while
 * running fights the spinner's redraw. Streaming subprocesses (`pulumi up`,
 * `docker`) must not be wrapped.
 */
export async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  if (!spinnerEnabled()) {
    process.stderr.write(`→ ${label}\n`);
    return task();
  }
  let frame = 0;
  process.stderr.write(`${pc.cyan(SPINNER_FRAMES[0])} ${label}`);
  const timer = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length;
    process.stderr.write(`\r${pc.cyan(SPINNER_FRAMES[frame]!)} ${label}`);
  }, 80);
  try {
    return await task();
  } finally {
    clearInterval(timer);
    process.stderr.write('\r\x1b[2K');
  }
}

/** A recovery hint printed after a failure: a runnable command and why. */
export interface Hint {
  command: string;
  description?: string;
}

/**
 * Print an error followed by a concrete recovery command, then exit. Every
 * operator-facing failure should end this way so the next step is always named,
 * never left for the reader to reconstruct. Returns `never`; use it at CLI and
 * task entry points, not inside in-process tasks that must throw so an
 * orchestrator can catch them.
 */
export function failWithHint(message: string, hint: Hint, code = 1): never {
  console.error(`\n${crossMark} ${message}`);
  if (hint.description) console.error(`  ${pc.dim(hint.description)}`);
  console.error(`  ${pc.bold('Next:')} ${pc.cyan(hint.command)}`);
  process.exit(code);
}
