import { existsSync } from 'node:fs';

const envFile = new URL('../../backend/.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

process.env.MODE = 'jobs';
// Imported after the env file loads so appConfig's env-sensitive init (APP_MODE, URL overrides) sees .env.
const { appConfig } = await import('shared');
process.env.PORT = String(appConfig.devPorts.jobs);

await import('../../backend/src/main.ts');
