/**
 * Waits for the backend health endpoint before proceeding.
 *
 * @see README.md
 */
import { waitForBackend } from '../src/utils/wait-for-backend';

const args = process.argv.slice(2);
let interval = 1000;
let timeout = 30000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-i' && args[i + 1]) interval = Number(args[i + 1]);
  if (args[i] === '-t' && args[i + 1]) timeout = Number(args[i + 1]);
}

try {
  await waitForBackend(interval, timeout);
} catch {
  console.error(`Backend not ready after ${timeout}ms`);
  process.exit(1);
}
process.exit(1);
