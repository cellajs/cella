// Thin entrypoint — delegates to backend/src/main.ts with MODE=ai-worker.
// All AI worker code lives in backend/src/modules/ai/worker/.
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../backend/.env'), quiet: true });

process.env.MODE = 'ai-worker';
process.env.PORT = '4003';

await import('../../backend/src/main.ts');

export {};
