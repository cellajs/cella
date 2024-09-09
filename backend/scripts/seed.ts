import { execSync } from 'node:child_process';
import { argv } from 'node:process';
import { config } from 'config';

const args = argv.slice(2);
const addImagesFlag = args.includes('--addImages');

for (const cmd of config.seedScripts) {
  try {
    // Conditionally append the --addImages flag if applicable
    const command = cmd.includes('seed:organizations') && addImagesFlag ? `${cmd} --addImages` : cmd;
    // Execute the command
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
