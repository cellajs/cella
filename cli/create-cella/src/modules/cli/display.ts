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
 * Displays the final success message after project creation.
 */
export function showSuccess(
  projectName: string,
  _targetFolder: string,
  relativePath: string,
  needsCd: boolean,
  packageManager: string,
): void {
  console.info(DIVIDER);
  console.info();

  // Navigation instruction
  if (needsCd) {
    console.info(`${pc.green('→')} cd ${pc.cyan(relativePath)}`);
    console.info();
  }

  // Quick start options
  console.info(`${pc.green('→')} ${pc.cyan(`${packageManager} quick`)}       ${pc.gray('(pglite, no docker)')}`);
  console.info();
  console.info(pc.gray('or, for full setup:'));
  console.info();
  console.info(
    `${pc.green('→')} ${pc.cyan(`${packageManager} docker`)} ${pc.dim('&&')} ${pc.cyan(`${packageManager} seed`)} ${pc.dim('&&')} ${pc.cyan(`${packageManager} dev`)}`,
  );
  console.info();

  // Credentials
  console.info(`sign in: ${pc.gray('admin-test@cellajs.com / 12345678')}`);
  console.info();
  console.info(`enjoy building ${pc.green(projectName)} with cella!`);
  console.info();
}
