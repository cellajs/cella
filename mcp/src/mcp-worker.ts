import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../backend/.env'), quiet: true });

process.env.MODE = 'mcp';
process.env.PORT = '4003';

await import('../../backend/src/main.ts');
