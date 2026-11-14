import { crossMark, pc } from '../../lib/utils/cli-output';
import { PromptBack } from './back';

/** Thrown where the operator's Ctrl-C stops work that holds no prompt, such as a deploy being followed: it ends the action as a Ctrl-C at a prompt does. */
export class Interrupted extends Error {
  constructor() {
    super('the operator pressed Ctrl-C');
    this.name = 'Interrupted';
  }
}

/** True for the operator's Ctrl-C: the rejection an Inquirer prompt throws for it (or when its input closes), or {@link Interrupted}. */
export function isPromptAbort(error: unknown): boolean {
  return error instanceof Interrupted || (error instanceof Error && error.name === 'ExitPromptError');
}

/**
 * Run work that waits without a prompt, such as a poll, so a Ctrl-C rejects it with {@link Interrupted} at once. The work reads `signal`
 * between its steps and stops printing once it is aborted.
 */
export async function untilInterrupt<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.on('SIGINT', onInterrupt);
  const running = work(controller.signal);
  running.catch(() => {});
  try {
    return await Promise.race([
      running,
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Interrupted()), { once: true })),
    ]);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }
}

/**
 * Run a child process to its end while a Ctrl-C reaches the child alone, so this process lives on and its `finally` runs. The signal a
 * blocking spawn received is handled on the next tick, so the listener stays until then.
 */
export async function shieldInterrupt<T>(run: () => T): Promise<T> {
  const ignore = () => {};
  process.on('SIGINT', ignore);
  try {
    return run();
  } finally {
    await new Promise((resolve) => setImmediate(resolve));
    process.removeListener('SIGINT', ignore);
  }
}

/** What ends a run whose prompt was aborted; the process state it reads and the calls it makes, replaceable in a test. */
export interface PromptAbortEffects {
  /** The run has a terminal, so the abort was the operator's Ctrl-C. */
  isTerminal: boolean;
  /** A held stack lease listens for SIGINT and releases the lock before it ends the process. */
  leaseHeld: boolean;
  log: (line: string) => void;
  /** Send this process the interrupt the lease listens for. */
  interrupt: () => void;
  exit: (code: number) => void;
}

const liveEffects = (): PromptAbortEffects => ({
  isTerminal: Boolean(process.stdin.isTTY),
  leaseHeld: process.listenerCount('SIGINT') > 0,
  log: (line) => console.info(line),
  interrupt: () => process.kill(process.pid, 'SIGINT'),
  exit: (code) => process.exit(code),
});

/**
 * End a run whose prompt was aborted. Inquirer holds the terminal in raw mode, so a Ctrl-C at a prompt sends no signal and reaches the
 * process as a rejected prompt.
 * - On a terminal the operator is leaving: one line, exit 0. While a stack lease is held the interrupt is raised for real, so the lock
 *   releases the way it does for a Ctrl-C between prompts and the process exits 130.
 * - Without a terminal nobody pressed a key: the prompt had no input to read. That is a failed run, so it says what to do and exits 1.
 */
export function endOnPromptAbort(overrides: Partial<PromptAbortEffects> = {}): void {
  const fx = { ...liveEffects(), ...overrides };
  if (!fx.isTerminal) {
    fx.log(
      `\n${crossMark} A prompt needed an answer and this run has no terminal to ask on.\n` +
        `  ${pc.dim('Run `pnpm infra` in a terminal: it changes infrastructure only with a person at the prompt.')}`,
    );
    fx.exit(1);
    return;
  }
  fx.log(pc.dim('\nCancelled.'));
  if (fx.leaseHeld) fx.interrupt();
  else fx.exit(0);
}

/**
 * Route every uncaught error of the CLI process: a prompt abort ends the run through {@link endOnPromptAbort}, anything else prints the way
 * Node prints an uncaught error and exits 1. Install it before the first prompt.
 */
export function installPromptAbortHandler(): void {
  process.on('uncaughtException', (error) => {
    if (isPromptAbort(error) || error instanceof PromptBack) {
      endOnPromptAbort();
      return;
    }
    console.error(error);
    process.exit(1);
  });
}
