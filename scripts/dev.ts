import { spawn } from 'node:child_process';
import http from 'node:http';

function waitForBackend() {
  const startedAt = Date.now();

  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const req = http.get('http://localhost:4000/ping', () => {
        resolve();
        req.destroy();
      });

      req.on('error', () => {
        if (Date.now() - startedAt > 15000) return reject(new Error('Backend did not start in time'));

        setTimeout(check, 300);
      });
    };

    check();
  });
}

async function runDev() {
  const backend = spawn('pnpm', ['-r', '--filter', 'backend', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  });

  const studio = spawn('pnpm', ['-r', '--filter', 'studio', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  });
  try {
    await waitForBackend();
  } catch (err) {
    backend.kill();
    process.exit(1);
  }

  const frontend = spawn('pnpm', ['-r', '--filter', 'frontend', 'dev'], {
    stdio: 'inherit',
    env: process.env,
  });

  const shutdown = () => {
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
    studio.kill('SIGINT');
    process.exit();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

runDev();
