import { SwizzleEntry, SwizzleMetadata } from '../../types';
import { config } from '../../config';
import { readJsonFile, writeJsonFile, resolvePath } from '../../utils/files';

let cachedMetadata: SwizzleMetadata | null = null;

/**
 * Loads swizzle metadata from the given file path.
 * Returns cached version if already loaded.
 */
export function loadSwizzleMetadata(): SwizzleMetadata | null {
  if (cachedMetadata) return cachedMetadata;

  const filePath = resolvePath(config.swizzle.localMetadataFilePath);
  cachedMetadata = readJsonFile<SwizzleMetadata>(filePath);

  return cachedMetadata;
}

/**
 * Retrieves swizzle metadata for a specific file path.
 * @param filePath The file path to retrieve swizzle metadata for.
 * @returns 
 */
export function getSwizzleMetadata(filePath: string): SwizzleEntry | null {
  const metadata = loadSwizzleMetadata();
  return metadata?.entries[filePath] || null;
}

/**
 * Clears the swizzle metadata cache.
 * Useful for tests or reloading after changes.
 */
export function clearSwizzleMetadataCache(): void {
  cachedMetadata = null;
}

/**
 * Write SwizzleMetadata to a JSON file.
 * Merges with existing metadata if file already exists.
 */
export function writeSwizzleMetadata(entries: SwizzleEntry[]): void {
  const filePath = resolvePath(config.swizzle.localMetadataFilePath);
  const existingMetadata = readJsonFile<SwizzleMetadata>(filePath);

  const mergedMetadata: SwizzleMetadata = {
    version: config.swizzle.metadataVersion,
    lastSyncedAt: new Date().toISOString(),
    entries: {
      ...existingMetadata?.entries || {},
      ...Object.fromEntries(entries.map(entry => [entry.filePath, entry]))
    },
  }

  writeJsonFile(filePath, mergedMetadata);
}