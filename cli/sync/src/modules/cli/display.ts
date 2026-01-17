import pc from 'picocolors';
import { config } from '../../config';
import { getSyncServiceDescription } from '../../config/sync-services';
import { DIVIDER, getHeaderLine } from '../../constants';

/**
 * Display the welcome message for the CLI (compact: 2 lines).
 */
export function showWelcome() {
  console.info();
  console.info(pc.cyan(getHeaderLine()));
  console.info(DIVIDER);
}

/**
 * Display the current configuration (compact format).
 * Shows description; service name is already visible from prompt selection.
 */
export function showConfiguration() {
  // Service description (dynamic, using config values)
  const description = getSyncServiceDescription(config.syncService, config);
  console.info(pc.gray(`↳ ${description}`));

  // Debug mode: show extended configuration
  if (config.debug) {
    console.info();
    showServiceConfiguration();
  }

  console.info(DIVIDER);
}

/**
 * Display the (most important) service-specific configuration.
 * Only shown in debug mode.
 */
export function showServiceConfiguration() {
  const parts: string[] = [];

  // Working directory
  const cwd = config.workingDirectory === process.cwd() ? '.' : config.workingDirectory;
  parts.push(`cwd=${pc.cyan(cwd)}`);

  // Swizzle metadata
  parts.push(`swizzle=${config.behavior.skipWritingSwizzleMetadataFile ? pc.red('✗') : pc.green('✓')}`);

  // Service-specific options
  if (config.syncService === 'sync') {
    parts.push(`pkg=${config.skipPackages ? pc.yellow('skip') : pc.green('✓')}`);
    parts.push(`squash-max=${pc.cyan(String(config.behavior.maxGitPreviewsForSquashCommits))}`);
  }

  console.info(`options: ${parts.join(' │ ')}`);
}

/**
 * Display the started message (compact).
 */
export function showStartedMessage() {
  console.info();
  console.info(`${pc.green('✓')} started ${pc.bold(config.syncService)}`);
}
