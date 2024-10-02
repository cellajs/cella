import fs from 'node:fs/promises';
import path from 'node:path';
import colors from 'picocolors';

import { TO_CLEAN, TO_REMOVE, TO_COPY } from '../constants.js';

/**
 * Cleans the specified template by removing designated folders and files.
 * @param {Object} params - Parameters containing targetFolder.
 * @param {string} params.targetFolder - The folder to clean.
 */
export async function cleanTemplate({
  targetFolder,
  projectName,
}) {
  // Change the current working directory to targetFolder if not already set
  if (process.cwd() !== targetFolder) {
    process.chdir(targetFolder);
  }

  return new Promise(async (resolve, reject) => {
    try {
      // Copy specified files
      for (const [src, dest] of Object.entries(TO_COPY)) {
        const srcAbsolutePath = path.resolve(targetFolder, src);
        const destAbsolutePath = path.resolve(targetFolder, dest);
        await copyFile(srcAbsolutePath, destAbsolutePath);
      }

      // Clean specified folder contents
      await Promise.all(TO_CLEAN.map(folderPath => {
        const absolutePath = path.resolve(targetFolder, folderPath);
        return removeFolderContents(absolutePath);
      }));

      // Remove specified files and folders
      await Promise.all(TO_REMOVE.map(filePath => {
        const absolutePath = path.resolve(targetFolder, filePath);
        return removeFileOrFolder(absolutePath);
      }));

      resolve();
    } catch (err) {
      reject(`Error during the cleaning process: ${err}`);
    }
  });
}

/**
 * Removes all contents within a specified folder.
 * @param {string} folderPath - The path of the folder to clean.
 */
export async function removeFolderContents(folderPath) {
  // List all files in the folder
  const files = await fs.readdir(folderPath); 

  await Promise.all(files.map(async (file) => {
    const filePath = path.join(folderPath, file);

    // Get the file or folder statistics
    const stat = await fs.lstat(filePath);

    // If it's a directory, remove it and all its contents
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      // If it's a file, remove it
      await fs.rm(filePath);
    }
  }));
}

/**
 * Removes a specified file or folder.
 * @param {string} pathToRemove - The path to the file or folder to remove.
 */
export async function removeFileOrFolder(pathToRemove) {
  await fs.rm(pathToRemove, { recursive: true, force: true });
}

// Helper function to copy files if the source exists
export async function copyFile(src, dest) {
  try {
    // Check if the source file exists
    await fs.access(src);

    // Ensure the destination directory exists
    await fs.mkdir(path.dirname(dest), { recursive: true });
    
    // Copy the file
    await fs.copyFile(src, dest);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.info(`\n${colors.yellow('⚠')} Source file "${src}" does not exist > Skip copy`);
    } else {
      throw err;
    }
  }
}