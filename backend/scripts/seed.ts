import { execSync } from 'node:child_process';
import { argv } from 'node:process';

const args = argv.slice(2);
const addImagesFlag = args.includes('--addImages');

const commands = [
  'pnpm run seed:user',
  `pnpm run seed:organizations ${addImagesFlag ? '--addImages' : ''}`,
  `pnpm run seed:data ${addImagesFlag ? '--addImages' : ''}`,
];

for (const cmd of commands) {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
