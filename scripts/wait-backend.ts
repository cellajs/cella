/**
 * Wait for the backend health endpoint before proceeding.
 * Derives the URL from appConfig so port changes only need to happen in development-config.ts.
 *
 * Usage: tsx scripts/wait-backend.ts [wait-on options]
 * Example: tsx scripts/wait-backend.ts -i 2000 -t 60000
 */
import { execSync } from 'node:child_process';
import { appConfig } from '../shared';

const args = process.argv.slice(2).join(' ');
const healthUrl = `${appConfig.backendUrl}/health`;

execSync(`npx wait-on ${args} ${healthUrl}`, { stdio: 'inherit' });
