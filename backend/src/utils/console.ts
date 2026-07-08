import ora, { type Ora } from 'ora';

export { changeMark, checkMark, crossMark, loadingMark, tildeMark, timestamp, warningMark } from 'shared/console';

// ============================================================================
// Spinner Utilities
// ============================================================================

/** Active spinner reference */
let activeSpinner: Ora | null = null;

/**
 * Start a spinner with the given message.
 * Automatically stops any previous spinner.
 */
export function startSpinner(message: string): Ora {
  if (activeSpinner) activeSpinner.stop();
  activeSpinner = ora({ text: message, color: 'cyan' }).start();
  return activeSpinner;
}

/**
 * Stop the active spinner with a success message.
 */
export function succeedSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.succeed(message);
    activeSpinner = null;
  }
}

/**
 * Stop the active spinner with a failure message.
 */
export function failSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.fail(message);
    activeSpinner = null;
  }
}

/**
 * Stop the active spinner with a warning message.
 */
export function warnSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.warn(message);
    activeSpinner = null;
  }
}
