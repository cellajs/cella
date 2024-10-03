import { spawn } from "node:child_process";

export async function runGitCommand({ targetFolder, command }) {
    return new Promise((resolve, reject) => {
      const child = spawn(`git ${command}`, [], { cwd: targetFolder, shell: true, timeout: 60000 });
  
      let output = '';
      let errOutput = '';

      child.on("error", (error) => {
        reject(error);
      });
  
      child.on("exit", (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(`Command failed with exit code "${code}", stderr "${errOutput}" and output "${output}"`);
        }
      });
      
      // Collect stdout data
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Swallow stderr
      child.stderr.on("data", (data) => {
        errOutput += data.toString();
      });
    });
  }