import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

// Install lefthook as part of prepare script
if (process.env.NODE_ENV === 'development') {
  console.info('Installing lefthook & Biome VSCode extension.');

  try {
    execSync('lefthook install && code --install-extension biomejs.biome', { stdio: 'inherit' });
  } catch (error) {
    console.error('Error occurred during the prepare script:', error.message);
  }
} else {
  console.info('Not in development. Skipping prepare script.');
  process.exit(0);
}
