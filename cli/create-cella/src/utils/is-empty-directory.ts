import { readdir } from 'node:fs/promises';

/**
 * Checks if a directory is empty or only contains a .git directory.
 * 
 * @param path - The path of the directory to check.
 * @returns Resolves to true if the directory is empty or contains only a .git folder, false otherwise.
 * @throws Throws an error if the path is not a directory or if there's an issue reading the directory.
 */
export async function isEmptyDirectory(path: string): Promise<boolean> {
  const files = await readdir(path);

  // Check if directory is empty or contains only the .git directory
  return files.length === 0 || (files.length === 1 && files[0] === '.git');
}
