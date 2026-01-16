/**
 * Generate Script Runner
 *
 * Runs all generation scripts defined in appConfig.generateScripts.
 *
 * Usage:
 *   pnpm generate
 */

import { appConfig } from 'config';
import { runGenerateScripts } from './migrations/helpers/run-generate-scripts';

runGenerateScripts(appConfig.generateScripts).catch((err) => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
