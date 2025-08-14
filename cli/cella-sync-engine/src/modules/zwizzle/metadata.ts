import { ZwizzleEntry, ZwizzleMetadata } from '../../types';
import { zwizzleConfig } from '../../config';
import { readJsonFile, writeJsonFile, resolvePath } from '../../utils/files';

let cachedMetadata: ZwizzleMetadata | null = null;

/**
 * Loads zwizzle metadata from the given file path.
 * Returns cached version if already loaded.
 */
export function loadZwizzleMetadata(): ZwizzleMetadata | null {
  if (cachedMetadata) return cachedMetadata;

  const filePath = resolvePath(zwizzleConfig.filePath);
  cachedMetadata = readJsonFile<ZwizzleMetadata>(filePath);

  return cachedMetadata;
}

/**
 * Retrieves zwizzle metadata for a specific file path.
 * @param filePath The file path to retrieve zwizzle metadata for.
 * @returns 
 */
export function getZwizzleMetadata(filePath: string): ZwizzleEntry | null {
  const metadata = loadZwizzleMetadata();
  return metadata?.entries[filePath] || null;
}

/**
 * Clears the zwizzle metadata cache.
 * Useful for tests or reloading after changes.
 */
export function clearZwizzleMetadataCache(): void {
  cachedMetadata = null;
}

/**
 * Write ZwizzleMetadata to a JSON file.
 * Merges with existing metadata if file already exists.
 */
export function writeZwizzleMetadata(metadata: ZwizzleMetadata) {
  const filePath = resolvePath(zwizzleConfig.filePath);
  const existingMetadata = readJsonFile<ZwizzleMetadata>(filePath);

  const mergedMetadata: ZwizzleMetadata = existingMetadata
    ? {
        version: metadata.version,
        entries: {
          ...existingMetadata.entries,
          ...metadata.entries, // new entries overwrite existing ones
        },
      }
    : metadata;

  writeJsonFile(filePath, mergedMetadata);
}