import pc from 'picocolors';

export const checkMark = pc.bold(pc.greenBright('✔'));

export const crossMark = pc.bold(pc.redBright('✖'));

export const warningMark = pc.bold(pc.yellowBright('⚠'));

export const changeMark = pc.bold(pc.yellowBright('✎'));

export const tildeMark = pc.bold(pc.yellowBright('~'));

export const loadingMark = pc.bold(pc.cyan('↻'));

/** pino-pretty format: [HH:MM:ss.lll]. */
export const timestamp = () => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return pc.dim(`[${h}:${m}:${s}.${ms}]`);
};
