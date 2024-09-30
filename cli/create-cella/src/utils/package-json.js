import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Reads and parses the package.json file located in the root directory.
 * 
 * @returns {Promise<object>} - A promise that resolves to the parsed package.json object.
 * @throws {Error} - Throws an error if the package.json file cannot be found or read, or if the JSON is invalid.
 */
async function readPackageJson() {
  const PACKAGE_JSON_FILE = resolve(
    fileURLToPath(import.meta.url),
    '../../../package.json',
  );

  const packageJson = await readFile(PACKAGE_JSON_FILE, 'utf-8')
  return JSON.parse(packageJson)
}

// Load the package.json at module initialization
export const packageJson = await readPackageJson()