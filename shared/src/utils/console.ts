import pc from 'picocolors';

/** Green checkmark prefix for success messages */
export const checkMark = pc.bold(pc.greenBright('✔'));

/** Cross mark for error messages */
export const crossMark = pc.bold(pc.redBright('✖'));

/** Warning mark for non-fatal warnings */
export const warningMark = pc.bold(pc.yellowBright('⚠'));

/** Pencil mark for change notifications */
export const changeMark = pc.bold(pc.yellowBright('✎'));

/** Tilde mark for changed/evolved items */
export const tildeMark = pc.bold(pc.yellowBright('~'));

/** Loading spinner for ongoing operations (static fallback) */
export const loadingMark = pc.bold(pc.cyan('↻'));

/** Timestamp in pino-pretty format: [HH:MM:ss.lll] */
export const timestamp = () => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return pc.dim(`[${h}:${m}:${s}.${ms}]`);
};
