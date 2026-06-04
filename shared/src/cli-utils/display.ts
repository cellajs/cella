import pc from 'picocolors';

/** Thin line divider for console output (60 chars wide) */
export const DIVIDER = '─'.repeat(60);

/**
 * Print the welcome header used across all Cella CLIs.
 *
 * Renders:
 *   ⧈ {name} · v{version}                             cellajs.com
 *   ────────────────────────────────────────────────────────────
 *
 * @param name    CLI name, e.g. 'cella bench' or 'raak infra'
 * @param version Optional semver string shown as `· v{version}`
 * @param right   Right-aligned label. Defaults to 'cellajs.com'
 */
export function printHeader(name: string, version?: string, right = 'cellajs.com'): void {
  const visibleLeft = version ? `⧈ ${name} · v${version}` : `⧈ ${name}`;
  const padding = Math.max(1, 60 - visibleLeft.length - right.length);
  const left = version ? `${pc.cyan(`⧈ ${name}`)}${pc.dim(` · v${version}`)}` : pc.cyan(`⧈ ${name}`);
  console.info();
  console.info(`${left}${' '.repeat(padding)}${pc.cyan(right)}`);
  console.info(DIVIDER);
  console.info();
}

/**
 * Print a completed step with a green checkmark.
 * An optional detail line is shown in dim below, followed by a blank line.
 */
export function printStep(label: string, detail?: string): void {
  console.info(`${pc.green('✓')} ${label}`);
  if (detail) {
    console.info(`  ${pc.dim(detail)}`);
    console.info();
  }
}

/** Print a failure line with a red cross. */
export function printError(label: string): void {
  console.info(`${pc.red('✗')} ${label}`);
}
