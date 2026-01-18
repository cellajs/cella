// Dependencies

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { stat } from 'fs/promises';
import * as path from 'path';

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
