import { SwizzleSettings, SwizzleAnalysis } from '../../types';
import { swizzleConfig } from '../../config';
import { matchPathPattern, readJsonFile, resolvePath } from '../../utils/files';

let cachedSettings: SwizzleSettings | null = null;

/**
 * Loads swizzle settings from the given file path.
 * Returns cached version if already loaded.
 */
export function loadSwizzleSettings(): SwizzleSettings | null {
  if (cachedSettings) return cachedSettings;

  const filePath = resolvePath(swizzleConfig.settingsFilePath);
  cachedSettings = readJsonFile<SwizzleSettings>(filePath);

  return cachedSettings;
}

/**
 * Retrieves swizzle settings for a specific file path.
 * @param filePath The file path to retrieve swizzle settings for.
 * @returns 
 */
export function getSwizzleSettings(): SwizzleSettings | null {
  const settings = loadSwizzleSettings();
  return settings;
}

/**
 * Clears the swizzle settings cache.
 * Useful for tests or reloading after changes.
 */
export function clearSwizzleSettingsCache(): void {
  cachedSettings = null;
}

/**
 * Gets the swizzle status for a specific file path.
 * @param filePath The file path to check.
 * @returns The swizzle status if found, otherwise undefined.
 */
export function getFlaggedAs(filePath: string): SwizzleAnalysis["flaggedInSettingsAs"] {
  const settings = getSwizzleSettings();
  if (!settings) return undefined;

  if (settings.removed?.some(pattern => matchPathPattern(filePath, pattern))) {
    return 'removed';
  }

  if (settings.edited?.some(pattern => matchPathPattern(filePath, pattern))) {
    return 'edited';
  }

  return undefined;
}