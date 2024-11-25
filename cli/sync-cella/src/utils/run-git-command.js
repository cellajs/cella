import { spawn } from "node:child_process";

// Helper to determine the type of Git command for custom handling
function getGitCommandType(command) {
  if (command.startsWith('merge')) return 'merge';
  if (command.startsWith('diff')) return 'diff';
  return 'other';
}

// Helper to check if a Git command is successful
function isGitCommandSuccess(gitCommand, code, errOutput) {
  if (gitCommand === 'merge') return (code === 0 || (code === 1 && !errOutput));
  if (gitCommand === 'diff') return (code === 0 || (code === 2 && !errOutput));
  return code === 0;
}

export async function runGitCommand({ targetFolder, command }) {
    return new Promise((resolve, reject) => {
      const gitCommand = getGitCommandType(command);
      const child = spawn(`git ${command}`, [], { cwd: targetFolder, shell: true, timeout: 60000 });
  
      let output = '';
      let errOutput = '';

      child.on("error", (error) => {
        reject(error);
      });
  
      child.on("exit", (code) => {
        if (isGitCommandSuccess(gitCommand, code, errOutput)) {
          resolve(output.trim());
        } else {
          reject(
            `Git ${gitCommand} command failed with exit code ${code}, stderr: "${errOutput.trim()}", stdout: "${output.trim()}"`
          );
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