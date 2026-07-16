import { spawn } from 'node:child_process';

/**
 * Run `drizzle-kit generate` to create the schema-diff migration folder.
 *
 * This is the first phase of `pnpm generate`; the side-effect collector runs after it so its
 * combined folder sorts (and therefore applies) after the schema changes. Uses tsx so path
 * aliases (`#/`) resolve while drizzle-kit scans the schema.
 */
export function runDrizzleGenerate(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tsx node_modules/drizzle-kit/bin.cjs generate --config drizzle.config.ts', {
      shell: true,
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`drizzle-kit exited with code ${code}`));
    });

    child.on('error', reject);
  });
}
