import pc from 'picocolors';

/** 60 characters wide. */
export const DIVIDER = '─'.repeat(60);

export function printHeader(name: string, version?: string, right = 'cellajs.com'): void {
  const visibleLeft = version ? `⧈ ${name} · v${version}` : `⧈ ${name}`;
  const padding = Math.max(1, 60 - visibleLeft.length - right.length);
  const left = version ? `${pc.cyan(`⧈ ${name}`)}${pc.dim(` · v${version}`)}` : pc.cyan(`⧈ ${name}`);
  console.info();
  console.info(`${left}${' '.repeat(padding)}${pc.cyan(right)}`);
  console.info(DIVIDER);
  console.info();
}

/** An optional detail line prints dimmed below, followed by a blank line. */
export function printStep(label: string, detail?: string): void {
  console.info(`${pc.green('✓')} ${label}`);
  if (detail) {
    console.info(`  ${pc.dim(detail)}`);
    console.info();
  }
}

export function printError(label: string): void {
  console.info(`${pc.red('✗')} ${label}`);
}
