import { spawn } from "node:child_process";

export async function runGitCommand({ targetFolder, command }) {
    return new Promise((resolve, reject) => {
      const child = spawn(`git ${command}`, [], { cwd: targetFolder, shell: true, timeout: 60000 });
  
      child.on("error", (error) => {
        reject(error);
      });
  
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(`Command failed with exit code ${code}`);
        }
      });
  
      // Swallow stdout and stderr
      child.stdout.on("data", () => {});
      child.stderr.on("data", () => {});
    });
  }
  