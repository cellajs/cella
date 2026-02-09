/**
 * Console Utilities
 *
 * Shared console output helpers for consistent logging.
 */

import ora, { type Ora } from 'ora';
import pc from 'picocolors';

/** Green checkmark prefix for success messages */
export const checkMark = pc.bold(pc.greenBright('✔'));

/** Cross mark for error messages */
export const crossMark = pc.bold(pc.redBright('✖'));

/** Pencil mark for change notifications */
export const changeMark = pc.bold(pc.yellowBright('✎'));

/** Loading spinner for ongoing operations (static fallback) */
export const loadingMark = pc.bold(pc.cyan('↻'));

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

/**
 * Update the active spinner text.
 */
export function updateSpinner(message: string): void {
  if (activeSpinner) activeSpinner.text = message;
}

/**
 * Log a success message with a green checkmark prefix.
 */
export function logSuccess(message: string): void {
  console.info(`${checkMark} ${message}`);
}
