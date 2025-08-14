import fs from 'fs';
import path from 'path';
import { ZwizzleEntry, ZwizzleMetadata } from '../../types';
import { zwizzleConfig } from '../../config';

let cachedMetadata: ZwizzleMetadata | null = null;

/**
 * Loads zwizzle metadata from the given file path.
 * Returns cached version if already loaded.
 */
export function loadZwizzleMetadata(): ZwizzleMetadata | null {
  if (cachedMetadata) return cachedMetadata;

  const resolvedPath = path.resolve(zwizzleConfig.filePath);
  if (!fs.existsSync(resolvedPath)) return null;

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  cachedMetadata = JSON.parse(raw) as ZwizzleMetadata;
  return cachedMetadata;
}

/**
 * Retrieves zwizzle metadata for a specific file path.
 * @param filePath The file path to retrieve zwizzle metadata for.
 * @returns 
 */
export function getZwizzleMetadata(filePath: string): ZwizzleEntry | null {
  const metadata = loadZwizzleMetadata();
  if (!metadata) return null;

  return metadata.entries[filePath] || null;
}

/**
 * Clears the zwizzle metadata cache.
 * Useful for tests or reloading after changes.
 */
export function clearZwizzleMetadataCache(): void {
  cachedMetadata = null;
}