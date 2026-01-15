/**
 * Console Utilities
 *
 * Shared console output helpers for consistent logging.
 */

import pc from 'picocolors';

/** Green checkmark prefix for success messages */
export const checkMark = pc.bold(pc.greenBright('✔'));

/** Cross mark for error messages */
export const crossMark = pc.bold(pc.redBright('✖'));

/** Pencil mark for change notifications */
export const changeMark = pc.bold(pc.yellowBright('✎'));

/** Loading spinner for ongoing operations */
export const loadingMark = pc.bold(pc.cyan('↻'));

/**
 * Log a success message with a green checkmark prefix.
 */
export function logSuccess(message: string): void {
  console.info(`${checkMark} ${message}`);
}
