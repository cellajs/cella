import { execSync } from 'node:child_process';
import { config } from 'config';

for (const cmd of config.seedScripts) {
  try {
    // Execute the command
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
