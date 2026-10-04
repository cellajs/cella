import { crossMark, pc } from '../../lib/utils/cli-output';

/** True for the rejection an Inquirer prompt throws when the operator presses Ctrl-C at it, or when its input closes. */
export function isPromptAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
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
        `  ${pc.dim('Run `pnpm infra` in a terminal, or set INFRA_NON_INTERACTIVE=1 and pass the values it asks for through the environment.')}`,
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
    if (isPromptAbort(error)) {
      endOnPromptAbort();
      return;
    }
    console.error(error);
    process.exit(1);
  });
}
