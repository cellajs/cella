import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../backend/.env'), quiet: true });

process.env.MODE = 'mcp-worker';
process.env.PORT = '4003';

await import('../../backend/src/main.ts');

export {};
