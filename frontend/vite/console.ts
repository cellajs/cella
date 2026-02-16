import pc from 'picocolors';

/**
 * Console Utilities
 *
 * Shared console output helpers for consistent script logging.
 */

/** Green checkmark prefix for success messages */
export const checkMark = pc.bold(pc.greenBright('✔'));

/** Cross mark for error messages */
export const crossMark = pc.bold(pc.redBright('✖'));

/** Pencil mark for change notifications */
export const changeMark = pc.bold(pc.yellowBright('✎'));

/** Loading spinner for ongoing operations */
export const loadingMark = pc.bold(pc.cyan('↻'));

/** Prefix for machine-parseable status lines */
export const STATUS_PREFIX = '[Openapi gen]';
