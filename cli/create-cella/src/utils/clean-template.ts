import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';

import {
  generateEnvConfigs,
  generateEnvFromExample,
  getBackendEnvReplacements,
  getRootEnvReplacements,
  PLACEHOLDER_CONFIG,
  TO_CLEAN,
  TO_COPY,
  TO_REMOVE,
} from '#/constants';

/**
 * Cleans the specified template by removing designated folders and files.
 * @param params - Parameters containing the target folder, project name, and optional extra edits.
 */
export async function cleanTemplate({
  targetFolder,
  projectName,
  displayName,
  portOffset = 0,
  adminEmail = `admin@${projectName}.example.com`,
}: {
  targetFolder: string;
  projectName: string;
  displayName: string;
  portOffset?: number;
  adminEmail?: string;
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

      // Replace default-config.ts with interpolated placeholder config
      await applyPlaceholderConfig(targetFolder, projectName);

      // Generate root .env from .env.example (single source of truth for ports)
      const rootReplacements = getRootEnvReplacements(projectName, portOffset);
      const rootEnv = await generateEnvFromExample(path.resolve(targetFolder, '.env.example'), rootReplacements);
      await fs.writeFile(
        path.resolve(targetFolder, '.env'),
        rootEnv ??
          Object.entries(rootReplacements)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n'),
        'utf8',
      );

      // Generate backend .env from backend/.env.example
      const backendReplacements = getBackendEnvReplacements(adminEmail, portOffset);
      const backendEnv = await generateEnvFromExample(
        path.resolve(targetFolder, 'backend/.env.example'),
        backendReplacements,
      );
      if (backendEnv) {
        await fs.writeFile(path.resolve(targetFolder, 'backend/.env'), backendEnv, 'utf8');
      }

      // Generate minimal env config files with project values and ports baked in
      const envConfigs = generateEnvConfigs(projectName, displayName, portOffset);
      await Promise.all(
        Object.entries(envConfigs).map(([filePath, content]) =>
          fs.writeFile(path.resolve(targetFolder, filePath), content, 'utf8'),
        ),
      );

      // Clean specified folder contents
      await Promise.all(
        TO_CLEAN.map((folderPath) => {
          const absolutePath = path.resolve(targetFolder, folderPath);
          return removeFolderContents(absolutePath);
        }),
      );

      // Remove specified files and folders
      await Promise.all(
        TO_REMOVE.map((filePath) => {
          const absolutePath = path.resolve(targetFolder, filePath);
          return removeFileOrFolder(absolutePath);
        }),
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
    }),
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
      console.info(`\n${pc.yellow('⚠')} Source file "${src}" does not exist > Skip copy`);
    } else {
      throw err;
    }
  }
}

/**
 * Read the placeholder config template, interpolate project tokens, and
 * write it as `shared/default-config.ts` — replacing the original.
 */
async function applyPlaceholderConfig(targetFolder: string, projectName: string): Promise<void> {
  const displayName = projectName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const src = path.resolve(targetFolder, PLACEHOLDER_CONFIG);
  const dest = path.resolve(targetFolder, './shared/default-config.ts');

  try {
    let content = await fs.readFile(src, 'utf8');
    content = content.replaceAll('__project_name__', displayName);
    content = content.replaceAll('__project_slug__', projectName);
    await fs.writeFile(dest, content, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.info(`\n${pc.yellow('⚠')} Placeholder config "${src}" not found > Skip`);
    } else {
      throw err;
    }
  }
}
