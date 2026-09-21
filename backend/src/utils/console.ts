import ora, { type Ora } from 'ora';
import pc from 'picocolors';
import { warningMark } from 'shared/utils/console';

export { changeMark, checkMark, crossMark, loadingMark, tildeMark, timestamp, warningMark } from 'shared/utils/console';

// Spinner utilities

let activeSpinner: Ora | null = null;
let spinnerStartedAt = 0;

/** Compact elapsed time: 340ms, 12.3s, 4m 07s. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 59_950) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, '0')}s`;
}

/** Dimmed elapsed-time suffix for a closing line, so slow steps stand out in the script output. */
export const durationSuffix = (startedAt: number) => pc.dim(` (${formatDuration(performance.now() - startedAt)})`);

/** Closing text of the active spinner: the message, or its running text, plus the time since it started. */
const closingText = (spinner: Ora, message?: string) => `${message ?? spinner.text}${durationSuffix(spinnerStartedAt)}`;

/** Stops any previous spinner. */
export function startSpinner(message: string): Ora {
  if (activeSpinner) activeSpinner.stop();
  activeSpinner = ora({ text: message, color: 'cyan' }).start();
  spinnerStartedAt = performance.now();
  return activeSpinner;
}

export function updateSpinner(message: string): void {
  if (activeSpinner) activeSpinner.text = message;
}

export function succeedSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.succeed(closingText(activeSpinner, message));
    activeSpinner = null;
  }
}

export function failSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.fail(closingText(activeSpinner, message));
    activeSpinner = null;
  }
}

/** Ends the spinner. For a warning while the step continues, use {@link noteSpinnerWarning}. */
export function warnSpinner(message?: string): void {
  if (activeSpinner) {
    activeSpinner.warn(closingText(activeSpinner, message));
    activeSpinner = null;
  }
}

/** Prints a warning line and keeps the spinner running, so the step still reports its own closing line. */
export function noteSpinnerWarning(message: string): void {
  if (!activeSpinner) {
    console.warn(`${warningMark} ${message}`);
    return;
  }
  const text = activeSpinner.text;
  activeSpinner.stopAndPersist({ symbol: warningMark, text: message });
  activeSpinner.start(text);
}
