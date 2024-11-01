import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  name?: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

// Helper function to read and parse package.json
async function readPackageJson(): Promise<PackageJson> {
  const PACKAGE_JSON_FILE = resolve(
    fileURLToPath(import.meta.url),
    '../../../package.json'
  );

  const packageJsonContent = await readFile(PACKAGE_JSON_FILE, 'utf-8');
  return JSON.parse(packageJsonContent) as PackageJson;
}

// Export the parsed package.json content
export const packageJson: PackageJson = await readPackageJson();
