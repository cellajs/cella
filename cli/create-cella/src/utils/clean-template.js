import { TO_CLEAN, TO_REMOVE } from '../constants.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function cleanTemplate({
  targetFolder,
}) {
  // Change directory to targetFolder if not already there
  if (process.cwd() !== targetFolder) {
    process.chdir(targetFolder);
  }

  return new Promise(async (resolve, reject) => {
    try {
      // Clean folder contents
      for (const folderPath of TO_CLEAN) {
        const absolutePath = path.resolve(targetFolder, folderPath);
        await removeFolderContents(absolutePath);
      }

      // Remove files and folders
      for (const filePath of TO_REMOVE) {
        const absolutePath = path.resolve(targetFolder, filePath);
        await removeFileOrFolder(absolutePath);
      }

      resolve();
    } catch (err) {
      reject(`Error during cleaning process: ${err}`);
    }
  });
}

// Helper function to remove contents of a folder
export async function removeFolderContents(folderPath) {
  const files = await fs.readdir(folderPath); // List all files in the folder
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stat = await fs.lstat(filePath); // Get the file/folder information

    if (stat.isDirectory()) {
      // If it's a directory, remove the directory and its contents
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      // If it's a file, remove it
      await fs.rm(filePath);
    }
  }
}

// Helper function to remove files or folders
export async function removeFileOrFolder(pathToRemove) {
  await fs.rm(pathToRemove, { recursive: true, force: true });
}