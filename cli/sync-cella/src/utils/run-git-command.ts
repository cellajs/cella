import { spawn } from 'node:child_process';

type GitCommandType = 'merge' | 'diff' | 'other';

interface RunGitCommandOptions {
  targetFolder: string;
  command: string;
}

// Helper to determine the type of Git command for custom handling
function getGitCommandType(command: string): GitCommandType {
  if (command.startsWith('merge')) return 'merge';
  if (command.startsWith('diff')) return 'diff';
  return 'other';
}

// Helper to check if a Git command is successful
function isGitCommandSuccess(gitCommand: GitCommandType, code: number | null, errOutput: string): boolean {
  if (gitCommand === 'merge') return code === 0 || (code === 1 && !errOutput);
  if (gitCommand === 'diff') return code === 0 || (code === 2 && !errOutput);
  return code === 0;
}

// Function to run a Git command and handle its output
export async function runGitCommand({ targetFolder, command }: RunGitCommandOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const gitCommand = getGitCommandType(command);
    const child = spawn(`git ${command}`, [], { cwd: targetFolder, shell: true, timeout: 60000 });

    let output = '';
    let errOutput = '';

    child.on('error', (error: Error) => {
      reject(error);
    });

    child.on('exit', (code: number | null) => {
      if (isGitCommandSuccess(gitCommand, code, errOutput)) {
        resolve(output.trim());
      } else {
        reject(
          `Git ${gitCommand} command failed with exit code ${code}, stderr: "${errOutput.trim()}", stdout: "${output.trim()}"`
        );
      }
    });

    // Collect stdout data
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    // Collect stderr data
    child.stderr.on('data', (data: Buffer) => {
      errOutput += data.toString();
    });
  });
}
