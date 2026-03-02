/**
 * Start Storybook with a port derived from appConfig.
 * Port = frontend port + 3006 (e.g., 3000→6006, 3010→6016).
 * This ensures each fork gets its own Storybook port automatically.
 */
import { execSync } from 'node:child_process';
import { appConfig } from '../../shared';

const port = Number(new URL(appConfig.frontendUrl).port) + 3006;

execSync(`cross-env STORYBOOK=true storybook dev -p ${port} --quiet --no-open`, {
  stdio: 'inherit',
  env: { ...process.env, STORYBOOK: 'true' },
});
