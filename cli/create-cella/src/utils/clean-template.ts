import fs from 'node:fs/promises';
import path from 'node:path';
import colors from 'picocolors';

import { TO_CLEAN, TO_REMOVE, TO_COPY, TO_EDIT } from '../constants.ts';

/**
 * Cleans the specified template by removing designated folders and files.
 * @param params - Parameters containing the target folder and project name.
 */
export async function cleanTemplate({
  targetFolder,
  projectName,
}: {
  targetFolder: string;
  projectName: string;
}): Promise<void> {
  // Change the current working directory to targetFolder if not already set
  if (process.cwd() !== targetFolder) {
    process.chdir(targetFolder);
  }

  return new Promise<void>(async (resolve, reject) => {
    try {
      // Copy specified files
      for (const [src, dest] of Object.entries(TO_COPY)) {
        const srcAbsolutePath = path.resolve(targetFolder, src);
        const destAbsolutePath = path.resolve(targetFolder, dest);
        await copyFile(srcAbsolutePath, destAbsolutePath);
      }

      // Clean specified folder contents
      await Promise.all(
        TO_CLEAN.map((folderPath) => {
          const absolutePath = path.resolve(targetFolder, folderPath);
          return removeFolderContents(absolutePath);
        })
      );

      // Remove specified files and folders
      await Promise.all(
        TO_REMOVE.map((filePath) => {
          const absolutePath = path.resolve(targetFolder, filePath);
          return removeFileOrFolder(absolutePath);
        })
      );

      // Edit specific files
      await Promise.all(Object.entries(TO_EDIT).map(async ([filePath, edits]) => {
          const absolutePath = path.resolve(targetFolder, filePath);
          await editFile(absolutePath, edits);
        })
      );

      resolve();
    } catch (err) {
      reject(`Error during the cleaning process: ${err}`);
    }
  });
}

/**
 * Removes all contents within a specified folder.
 * @param folderPath - The path of the folder to clean.
 */
export async function removeFolderContents(folderPath: string): Promise<void> {
  // List all files in the folder
  const files = await fs.readdir(folderPath);

  await Promise.all(
    files.map(async (file) => {
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
    })
  );
}

/**
 * Removes a specified file or folder.
 * @param pathToRemove - The path to the file or folder to remove.
 */
export async function removeFileOrFolder(pathToRemove: string): Promise<void> {
  await fs.rm(pathToRemove, { recursive: true, force: true });
}

/**
 * Helper function to copy files if the source exists.
 * @param src - The source file path.
 * @param dest - The destination file path.
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  try {
    // Check if the source file exists
    await fs.access(src);

    // Ensure the destination directory exists
    await fs.mkdir(path.dirname(dest), { recursive: true });

    // Copy the file
    await fs.copyFile(src, dest);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.info(`\n${colors.yellow('⚠')} Source file "${src}" does not exist > Skip copy`);
    } else {
      throw err;
    }
  }
}

/**
 * Helper function edit a file by applying regex replacements.
 * @param filePath - The path of the file to edit.
 * @param edits - The list of edits to apply.
 */
export async function editFile(filePath: string, edits: Array<{regexMatch: RegExp; replaceWith: string }>): Promise<void> {
  try {
    await fs.access(filePath);

    // Read the existing file content
    const fileContent = await fs.readFile(filePath, 'utf8');
    let updatedContent = fileContent;
    
    // Apply each edit to the content
    edits.forEach(({ regexMatch, replaceWith }) => {
      updatedContent = updatedContent.replace(regexMatch, replaceWith);
    });

    // Write the updated content back to the file
    if (fileContent !== updatedContent) {
      await fs.writeFile(filePath, updatedContent, 'utf8');
    }

  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.info(`\n${colors.yellow('⚠')} Source file "${filePath}" does not exist > Skip edit`);
    } else {
      throw err;
    }
  }
}