import { mkdtemp, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Checks if a file is binary based on its extension.
 * This is a heuristic and may not cover all cases.
 *
 * @param filePath - The path of the file to check
 * @returns true if the file is likely binary, false otherwise
 */
const binaryExtensions = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.ico', '.webp', '.heic',

  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  
  // Archives & compressed files
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  
  // Audio & video
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a',
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  
  // Executables & binaries
  '.exe', '.dll', '.so', '.bin', '.apk', '.app', '.deb', '.rpm',
  
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2',
  
  // Others
  '.class', '.pyc', '.jar', '.iso', '.dmg',
]);

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.has(ext);
}

/**
 * Creates a temporary directory with a given prefix inside the OS temp directory.
 *
 * @param prefix - Prefix for the temp directory name
 * @returns The absolute path to the created temp directory
 */
export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a directory recursively and forcefully.
 *
 * @param dirPath - The directory path to remove
 */
export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}