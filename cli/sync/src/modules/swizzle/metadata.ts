import { config } from '../../config';
import { SwizzleEntry, SwizzleMetadata } from '../../types';
import { readJsonFile, resolvePath, writeJsonFile } from '../../utils/files';

let cachedMetadata: SwizzleMetadata | null = null;

/**
 * Loads swizzle metadata from the given file path.
 * Returns cached version if already loaded.
 *
 * @returns SwizzleMetadata or null if file doesn't exist.
 */
function loadSwizzleMetadata(): SwizzleMetadata | null {
  if (cachedMetadata) return cachedMetadata;

  const filePath = resolvePath(config.overrides.localMetadataFilePath);
  cachedMetadata = readJsonFile<SwizzleMetadata>(filePath);

  return cachedMetadata;
}

/**
 * Retrieves swizzle metadata for a specific file path.
 *
 * @param filePath - The file path to retrieve swizzle metadata for.
 *
 * @returns A SwizzleEntry if metadata exists for the file, otherwise null.
 */
export function getSwizzleMetadata(filePath: string): SwizzleEntry | null {
  const metadata = loadSwizzleMetadata();
  return metadata?.entries[filePath] || null;
}

/**
 * Write SwizzleMetadata to a JSON file.
 * Merges with existing metadata if file already exists.
 *
 * @param entries - Array of SwizzleEntry to write to metadata.
 *
 * @returns void
 */
export function writeSwizzleMetadata(entries: SwizzleEntry[]): void {
  const filePath = resolvePath(config.overrides.localMetadataFilePath);
  const existingMetadata = readJsonFile<SwizzleMetadata>(filePath);

  const mergedMetadata: SwizzleMetadata = {
    version: config.overrides.metadataVersion,
    lastSyncedAt: new Date().toISOString(),
    entries: {
      ...(existingMetadata?.entries || {}),
      ...Object.fromEntries(entries.map((entry) => [entry.filePath, entry])),
    },
  };

  // Write merged metadata back to file
  if (!config.behavior.skipWritingSwizzleMetadataFile) {
    writeJsonFile(filePath, mergedMetadata);
  }
}
