import spawn from 'nano-spawn';

/**
 * Executes a command using the specified package manager (e.g., pnpm).
 *
 * @param packageManager - The package manager to use (e.g., 'pnpm').
 * @param args - The arguments to pass to the package manager command.
 * @param env - Additional environment variables to set during command execution.
 * @returns A promise that resolves if the command executes successfully; otherwise, it rejects with an error message.
 */
export async function runPackageManagerCommand(
  packageManager: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<void> {
  try {
    await spawn(packageManager, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    throw new Error(`"${packageManager} ${args.join(' ')}" failed ${err.stdout || ''} ${err.stderr || ''}`);
  }
}

/**
 * Installs dependencies using the specified package manager.
 *
 * @param packageManager - The package manager to use for installation (e.g., 'pnpm').
 * @returns A promise that resolves if the installation completes successfully; otherwise, it rejects with an error.
 */
export async function install(packageManager: string): Promise<void> {
  return runPackageManagerCommand(packageManager, ['install'], {
    NODE_ENV: 'development',
  });
}

/**
 * Generates SQL files using the specified package manager.
 *
 * @param packageManager - The package manager to use for generation (e.g., 'pnpm').
 * @returns A promise that resolves if the generation completes successfully; otherwise, it rejects with an error.
 */
export async function generate(packageManager: string): Promise<void> {
  return runPackageManagerCommand(packageManager, ['generate'], {
    NODE_ENV: 'development',
  });
}
