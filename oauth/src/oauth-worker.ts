import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../backend/.env'), quiet: true });

process.env.MODE = 'oauth';
// Imported after dotenv so appConfig's env-sensitive init (APP_MODE, URL overrides) sees .env.
const { appConfig } = await import('shared');
process.env.PORT = String(appConfig.devPorts.oauth);

await import('../../backend/src/main.ts');
