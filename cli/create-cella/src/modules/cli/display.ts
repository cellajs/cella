import pc from 'picocolors';

import { DIVIDER, getHeaderLine } from '#/constants';

/**
 * Displays the compact CLI welcome header.
 * @param templateVersion - The version of the cella template being used
 */
export function showWelcome(templateVersion: string): void {
  console.info();
  console.info(pc.cyan(getHeaderLine(templateVersion)));
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
  }

  // Quick start options
  console.info(`${pc.green('→')} ${pc.cyan(`${packageManager} quick`)}  ${pc.gray('(pglite, no docker)')}`);
  console.info(`${pc.green('→')} ${pc.cyan(`${packageManager} dev`)}    ${pc.gray('(postgresql + docker)')}`);
  console.info();

  // Credentials
  console.info(pc.gray(`sign in: admin-test@cellajs.com / 12345678`));
  console.info();
  console.info(`Enjoy building ${pc.green(projectName)} with cella! 🎉`);
  console.info();
}

/**
 * Displays a warning message for skipped steps.
 */
export function showSkipWarning(flag: string, message: string): void {
  console.info(`${pc.yellow('⚠')} ${flag} → ${message}`);
}
