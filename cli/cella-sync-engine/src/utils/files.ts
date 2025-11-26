// Dependencies
import { mkdtemp, rm, stat } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// A simple list of common binary file extensions
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

/**
 * Determines if a file is likely binary based on its extension.
 *
 * ⚠️ This function uses a simple heuristic (by file extension),
 * so it may not correctly detect all binary or text files.
 *
 * @param filePath - The file path to inspect
 * 
 * @returns `true` if the file appears to be binary, otherwise `false`
 *
 * @example
 * isBinaryFile('image.png'); // true
 * isBinaryFile('src/index.ts'); // false
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.has(ext);
}

/**
 * Creates a temporary directory in the system’s temp folder with a given prefix.
 * Internally uses `fs.mkdtemp()` and returns the full path of the new directory.
 *
 * @param prefix - A short prefix for the directory name (e.g., `'myapp-'`)
 * 
 * @returns The absolute path to the created temporary directory
 *
 * @example
 * const tempDir = await createTempDir('myapp-');
 * console.info(tempDir); // /tmp/myapp-abc123
 */
export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a directory recursively and forcefully.
 * Internally calls `fs.rm()` with `{ recursive: true, force: true }`.
 *
 * @param dirPath - The directory path to remove
 * 
 * @returns A promise that resolves when the directory has been removed
 *
 * @example
 * await removeDir('/tmp/myapp-abc123');
 */
export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}


/**
 * Reads and parses a JSON file from disk.
 * Returns `null` if the file does not exist or cannot be parsed.
 *
 * @param filePath - The path to the JSON file
 * 
 * @returns The parsed JSON object, or `null` if reading or parsing fails
 *
 * @example
 * const config = readJsonFile<{ port: number }>('./config.json');
 * console.info(config?.port); // 3000
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
 * The output is pretty-printed with 2 spaces of indentation.
 *
 * @param filePath - The destination path for the JSON file
 * @param data - The JavaScript object or value to serialize and write
 * 
 * @returns void
 *
 * @example
 * writeJsonFile('./config.json', { port: 3000, debug: true });
 */
export function writeJsonFile(filePath: string, data: any): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Resolves a relative file path into an absolute path.
 * Equivalent to `path.resolve(filePath)`.
 *
 * @param filePath - The relative or absolute file path
 * 
 * @returns The absolute path
 *
 * @example
 * resolvePath('./src/index.ts'); // '/Users/me/project/src/index.ts'
 */
export function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Matches a file path against a glob-like pattern.
 * Supported pattern rules:
 * - `*` matches any number of characters (including `/`)
 * - Matching is case-sensitive
 *
 * @param filePath - The file path to test
 * @param pattern - The pattern to match (e.g., `'src/*.ts'`)
 * 
 * @returns `true` if the file path matches the pattern, otherwise `false`
 *
 * @example
 * matchPathPattern('src/utils/helpers.ts', 'src/*.ts'); // true
 * matchPathPattern('src/utils/helpers.ts', 'test/*.ts'); // false
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
 * Removes a file if it exists.
 * Internally checks with `fs.existsSync()` and uses `fs.rm()` with `{ force: true }`.
 *
 * @param filePath - The path to the file to remove
 * 
 * @returns A promise that resolves when the file has been removed (if it existed)
 *
 * @example
 * await removeFileIfExists('./dist/output.log');
 */
export async function removeFileIfExists(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    console.info('Removing file:', filePath);
    await rm(filePath, { force: true });
  }
}

/**
 * Checks if the specified path is a directory.
 * 
 * @param dirPath - The path to check
 * 
 * @returns `true` if the path is a directory, otherwise `false`
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
  if (!existsSync(dirPath)) {
    return false;
  }

  const stats = await stat(dirPath);
  return stats.isDirectory();
}