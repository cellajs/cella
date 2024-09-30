import fs from 'node:fs/promises';
import path from 'node:path';
import colors from 'picocolors';

import { TO_CLEAN, TO_REMOVE, TO_COPY, README_TEMPLATE } from '../constants.js';

export async function cleanTemplate({
  targetFolder,
  projectName,
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

      // Copy specified files
      for (const [src, dest] of Object.entries(TO_COPY)) {
        const srcAbsolutePath = path.resolve(targetFolder, src);
        const destAbsolutePath = path.resolve(targetFolder, dest);
        await copyFile(srcAbsolutePath, destAbsolutePath);
      }

      // Write the README.md file
      await writeReadme(targetFolder, {projectName});

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
      console.log(`\n${colors.yellow('⚠')} Source file "${src}" does not exist > Skip copy`);
    } else {
      throw err;
    }
  }
}

// Helper function to write README.md
export async function writeReadme(targetFolder, { projectName } = opts) {
  const readmePath = path.join(targetFolder, 'README.md');
  
  // Write or overwrite the README.md file
  await fs.writeFile(readmePath, README_TEMPLATE.replace(`{{projectName}}`, projectName).trim(), 'utf8');
}