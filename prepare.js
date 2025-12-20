import dotenv from 'dotenv';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

dotenv.config({ path: './backend/.env' });

// Install Lefthook and IDE extensions as part of prepare script
if (process.env.NODE_ENV === 'development') {
  console.info('Preparing the development environment...');

  try {
    // 1. Install Lefthook
    execSync('pnpm lefthook install', { stdio: 'inherit' });

    // 2. Install Biome VSCode extension if 'code' CLI is available
    try {
      execSync('code --version', { stdio: 'ignore' });
      execSync('code --install-extension biomejs.biome', { stdio: 'inherit' });
    } catch {
      if (fs.existsSync('.idea')) {
        console.info('WebStorm detected. A prompt to install the "Biome" plugin should appear when you open the project.');
      } else {
        console.info('VSCode CLI "code" not found. Skipping VSCode extension installation.');
      }
    }
  } catch (error) {
    console.error('Error occurred during the prepare script:', error.message);
  }
} else {
  console.info('Not in development. Skipping prepare script.');
  process.exit(0);
}
