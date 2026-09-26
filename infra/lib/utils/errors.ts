/**
 * Message of a caught value without assuming it is an `Error`; a thrown
 * string/object would make `(err as Error).message` yield `undefined` in
 * operator-facing output.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A task failure that asks for a specific process exit code. Being thrown, it stops a caller that runs the task
 * in-process (the deploy); the standalone entry (`runIfMain`) exits with `exitCode`.
 */
export class ExitCodeError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'ExitCodeError';
    this.exitCode = exitCode;
  }
}
