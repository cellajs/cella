import pc from "picocolors";

import { DESCRIPTION, NAME, VERSION, AUTHOR, GITHUB, WEBSITE } from "../../constants";
import { config } from "../../config";

const divider = '-------------------------------';

/**
 * Display the welcome message for the CLI.
 */
export function showWelcome() {
  console.info();
  console.info(divider);
  console.info(pc.cyan(NAME));
  console.info();
  console.info(pc.gray(DESCRIPTION));
  console.info(`Cli version ${pc.green(VERSION)}`);
  console.info(`Created by ${AUTHOR}`);
  console.info(`${GITHUB} | ${WEBSITE}`);
  console.info(divider);
  console.info();
}

/**
 * Display the current configuration
 */
export function showConfiguration() {
  console.info(divider);
  console.info(pc.bold('Boilerplate:'));
  console.info(`Location: ${pc.bold(config.boilerplate.location === 'local' ? '💻' : '🌐')} ${pc.cyan(config.boilerplate.location)}`);
  console.info(`Repository: ${pc.cyan(config.boilerplate.repoReference)}`);
  console.info(`Branch: <${pc.bold(pc.cyan(config.boilerplate.branch))}>`);
  console.info(`Remote Name: ${pc.bold('🔗')} ${pc.cyan(config.boilerplate.remoteName)}`);
  console.info();

  console.info(pc.bold('Fork:'));
  console.info(`Location: ${pc.bold(config.fork.location === 'local' ? '💻' : '🌐')} ${pc.cyan(config.fork.location)}`);
  console.info(`Repository: ${pc.cyan(config.fork.repoReference)}`);
  console.info(`Branch: <${pc.bold(pc.cyan(config.fork.branch))}>`);
  console.info(`Sync Branch: <${pc.bold(pc.cyan(config.fork.syncBranch))}>`);
  console.info(divider);
  console.info();
}

/**
 * Display the starting sync message.
 */
export function showStartingSyncMessage() {
  console.info();
  console.info(divider);
  console.info(pc.bold(pc.green('✓ Done configuring the sync engine!')));
  console.info(`Starting <${config.syncService}>`);
  console.info(divider);
  console.info();
}