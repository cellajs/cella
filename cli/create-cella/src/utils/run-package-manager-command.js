import spawn from 'cross-spawn'

/**
 * Executes a command using the specified package manager (e.g., pnpm).
 * 
 * @param {string} packageManager - The package manager to use (e.g., 'pnpm').
 * @param {Array<string>} args - The arguments to pass to the package manager command.
 * @param {Object} [env={}] - Additional environment variables to set during command execution.
 * @returns {Promise<void>} - A promise that resolves if the command executes successfully; otherwise, it rejects with an error message.
 */
export async function runPackageManagerCommand(packageManager, args, env = {} ) {
  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, args, {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

     // Buffer for capturing stderr and stdout output
    let stderrBuffer = ''
    let stdoutBuffer = ''

    // Capture stderr output
    child.stderr?.on('data', (data) => {
      stderrBuffer += data
    });

    // Capture stdout output
    child.stdout?.on('data', (data) => {
      stdoutBuffer += data
    });

    // Handle process exit
    child.on('close', (code) => {
      if (code !== 0) {
        reject(`"${packageManager} ${args.join(' ')}" failed ${stdoutBuffer} ${stderrBuffer}` );
        return;
      }
      resolve();
    });
  });
}

/**
 * Installs dependencies using the specified package manager.
 * 
 * @param {string} packageManager - The package manager to use for installation (e.g., ''pnpm').
 * @returns {Promise<void>} - A promise that resolves if the installation completes successfully; otherwise, it rejects with an error.
 */
export async function install(packageManager) {
  return runPackageManagerCommand(packageManager, ['install'], {
    NODE_ENV: 'development',
  });
}

/**
 * Generates sql files using the specified package manager.
 * 
 * @param {string} packageManager - The package manager to use for generation (e.g., 'pnpm').
 * @returns {Promise<void>} - A promise that resolves if the generation completes successfully; otherwise, it rejects with an error.
 */
export async function generate (packageManager) {
  return runPackageManagerCommand(packageManager, ['generate'], {
    NODE_ENV: 'development',
  });
}