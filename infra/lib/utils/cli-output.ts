import pc from 'picocolors';

// Console formatting for the infra CLI and tasks. Vendored so the engine has no workspace dependencies at runtime.

export { pc };

export const checkMark = pc.bold(pc.greenBright('✔'));

export const crossMark = pc.bold(pc.redBright('✖'));

export const warningMark = pc.bold(pc.yellowBright('⚠'));

export const changeMark = pc.bold(pc.yellowBright('✎'));

export const tildeMark = pc.bold(pc.yellowBright('~'));

export const DIVIDER = '─'.repeat(60);

export function printHeader(name: string, version?: string, right = ''): void {
  const visibleLeft = version ? `⧈ ${name} · v${version}` : `⧈ ${name}`;
  const padding = Math.max(1, 60 - visibleLeft.length - right.length);
  const left = version ? `${pc.cyan(`⧈ ${name}`)}${pc.dim(` · v${version}`)}` : pc.cyan(`⧈ ${name}`);
  console.info();
  console.info(`${left}${' '.repeat(padding)}${pc.cyan(right)}`);
  console.info(DIVIDER);
  console.info();
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** True when stderr is a TTY and the run is not automated; automation and piped output get a single static line. */
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
 * Show a spinner next to `label` while an async task runs. Everything goes to stderr so stdout stays clean for machine output such as `status --json`.
 * Only wrap tasks that produce no output of their own: a task that logs while running fights the spinner's redraw, so streaming subprocesses must not be wrapped.
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

/** Print an error plus a recovery command, then exit. Use at CLI and task entry points only: in-process tasks must throw so an orchestrator can catch them. */
export function failWithHint(message: string, hint: Hint, code = 1): never {
  console.error(`\n${crossMark} ${message}`);
  if (hint.description) console.error(`  ${pc.dim(hint.description)}`);
  console.error(`  ${pc.bold('Next:')} ${pc.cyan(hint.command)}`);
  process.exit(code);
}
