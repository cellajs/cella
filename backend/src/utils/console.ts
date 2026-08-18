import ora, { type Ora } from 'ora';

export { changeMark, checkMark, crossMark, loadingMark, tildeMark, timestamp, warningMark } from 'shared/utils/console';

// Spinner utilities

let activeSpinner: Ora | null = null;

/** Stops any previous spinner. */
export function startSpinner(message: string): Ora {
  if (activeSpinner) activeSpinner.stop();
  activeSpinner = ora({ text: message, color: 'cyan' }).start();
  return activeSpinner;
}

export function succeedSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.succeed(message);
    activeSpinner = null;
  }
}

export function failSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.fail(message);
    activeSpinner = null;
  }
}

export function warnSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.warn(message);
    activeSpinner = null;
  }
}
