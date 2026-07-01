import pc from 'picocolors';
import { DESCRIPTION, DIVIDER, getHeaderLine } from '#/constants';

/** ASCII art logo for the CLI welcome screen. */
function showAscii(): void {
  console.info(pc.cyan('                      _ _            '));
  console.info(pc.cyan('▒▓█████▓▒     ___ ___| | | __ _      '));
  console.info(pc.cyan('▒▓█   █▓▒    / __/ _ \\ | |/ _` |    '));
  console.info(pc.cyan('▒▓█   █▓▒   | (_|  __/ | | (_| |     '));
  console.info(pc.cyan('▒▓█████▓▒    \\___\\___|_|_|\\__,_|  '));
}

/**
 * Displays the compact CLI welcome header.
 * @param templateVersion - The version of the cella template being used
 */
export function showWelcome(templateVersion: string): void {
  console.info();
  showAscii();
  console.info();
  console.info(pc.dim(DESCRIPTION));
  console.info();
  console.info(getHeaderLine(templateVersion));
  console.info(DIVIDER);
}

/**
 * Print a cleared prompt's outcome as a persistent confirmation line:
 * `✓ <label> · <value>`, followed by a blank separator line. Used after prompts
 * that clear themselves on done so the chosen value stays visible.
 */
export function confirmChoice(label: string, value: string): void {
  console.info(`${pc.green('✓')} ${label} · ${value}`);
  console.info();
}

/**
 * Displays the final success message after project creation.
 */
export function showSuccess(
  projectName: string,
  _targetFolder: string,
  relativePath: string,
  needsCd: boolean,
  packageManager: string,
): void {
  console.info();

  console.info(pc.bold('Next steps'));
  console.info(DIVIDER);
  console.info();

  if (needsCd) {
    console.info(`${pc.dim('$')} cd ${pc.cyan(relativePath)}`);
  }
  console.info(`${pc.dim('$')} ${pc.cyan(`${packageManager} install`)}`);
  console.info(`${pc.dim('$')} ${pc.cyan(`${packageManager} generate`)}`);
  console.info(
    `${pc.dim('$')} ${pc.cyan(`${packageManager} docker`)} ${pc.dim('&&')} ${pc.cyan(`${packageManager} seed`)} ${pc.dim('&&')} ${pc.cyan(`${packageManager} dev`)}`,
  );
  console.info();

  // Point to the generated README for first-run details and sign-in credentials. Use the
  // path relative to the new project so the terminal linkifies the right file (not this CLI's).
  const readmePath = relativePath ? `${relativePath}/README.md` : 'README.md';
  console.info(`${pc.gray('To get started building, please read:')} ${pc.cyan(readmePath)}`);
  console.info();
  console.info(`🥳 enjoy building ${pc.green(projectName)} with cella!`);
  console.info();
}
