import { spawn } from "node:child_process";

/**
 * Executes a Git command in the specified target folder.
 * 
 * @param {Object} options - Options for running the Git command.
 * @param {string} options.targetFolder - The folder in which to run the command.
 * @param {string} options.command - The Git command to execute (e.g., 'init', 'commit -m "message"', etc.).
 * @returns {Promise<void>} - A promise that resolves if the command executes successfully; otherwise, it rejects with an error message.
 * @throws {Error} - Throws an error if the Git command fails or if there is an error starting the process.
 */
export async function runGitCommand({ targetFolder, command }) {
    return new Promise((resolve, reject) => {
      const child = spawn(`git ${command}`, [], { 
        cwd: targetFolder, 
        shell: true, 
        timeout: 60000,
      });
  
      // Handle process errors
      child.on("error", (error) => {
        reject(error);
      });
  
      // Handle command exit
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(`Git command failed with exit code ${code}`);
        }
      });
  
      // Swallow stdout and stderr
      child.stdout.on("data", () => {});
      child.stderr.on("data", () => {});
    });
  }
  