import { mkdtemp, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';

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

/**
 * Reads a JSON file and returns its content as an object.
 * Returns null if the file does not exist or cannot be parsed.
 *
 * @param filePath - The path to the JSON file
 */
export function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`Failed to read or parse JSON at ${filePath}:`, err);
    return null;
  }
}

/**
 * Writes an object to a JSON file.
 * If the file already exists, it will be overwritten.
 *
 * @param filePath - The path to the JSON file
 * @param data - The data to write to the file
 */
export function writeJsonFile(filePath: string, data: any): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Resolves a file path to an absolute path.
 *
 * @param filePath - The file path to resolve
 * @returns The absolute path
 */
export function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Matches a file path against a pattern.
 * - `*` can appear anywhere and matches any number of characters (including `/`)
 * - Matching is case-sensitive by default (can easily make it insensitive)
 */
export function matchPathPattern(filePath: string, pattern: string): boolean {

  // Escape regex special characters, except for '*'
  const escaped = pattern.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');

  // Replace '*' with '.*' (regex equivalent)
  const regexPattern = '^' + escaped.replace(/\*/g, '.*') + '$';

  // Create regex
  const regex = new RegExp(regexPattern);

  return regex.test(filePath);
}

/**
 * Removes a file from the filesystem if it exists.
 */
export async function removeFileIfExists(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    console.log('Removing file:', filePath);
    await rm(filePath, { force: true });
  }
}
