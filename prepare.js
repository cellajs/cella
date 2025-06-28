import dotenv from 'dotenv';
import { execSync } from 'node:child_process';

dotenv.config({ path: './backend/.env' });

// Install lefthook as part of prepare script
if (process.env.NODE_ENV === 'development') {
  console.info('Preparing the development environment: Installing Lefthook, Biome VSCode extension, and compiling TypeScript.');

  try {
    execSync('pnpm lefthook install && code --install-extension biomejs.biome', {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Error occurred during the prepare script:', error.message);
  }
} else {
  console.info('Not in development. Skipping prepare script.');
  process.exit(0);
}
