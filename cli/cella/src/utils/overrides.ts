/**
 * Override matching and validation utilities for sync CLI v2.
 *
 * Handles matching files against ignored/pinned patterns and
 * validates config for potential issues.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CellaCliConfig } from '../config/types';
import { warningMark } from './display';

/**
 * Check if a file path is owned by any of the given folders.
 *
 * Folders are directory prefixes (not globs): an entry matches the file when
 * the path equals the entry exactly or is nested under `entry + '/'`.
 *
 * @param filePath - The file path to test
 * @param folders - Folder prefixes (or exact paths) to match against
 */
export function isUnderAnyFolder(filePath: string, folders: string[]): boolean {
  return folders.some((folder) => {
    const entry = folder.replace(/\/+$/, '');
    return filePath === entry || filePath.startsWith(`${entry}/`);
  });
}

/**
 * Check if a file is inside an ignored folder.
 */
export function isIgnored(filePath: string, config: CellaCliConfig): boolean {
  return isUnderAnyFolder(filePath, config.overrides?.ignoredFolders || []);
}

/**
 * Check if a file path is a package.json file.
 * Package.json files are always auto-pinned (handled by the packages service).
 */
export function isPackageJson(filePath: string): boolean {
  return filePath === 'package.json' || filePath.endsWith('/package.json');
}

/**
 * Check if a file is in the pinned list.
 * Package.json files are always considered pinned (auto-handled by packages service).
 */
export function isPinned(filePath: string, config: CellaCliConfig): boolean {
  if (isPackageJson(filePath)) return true;
  const files = config.overrides?.pinnedFiles || [];
  return files.includes(filePath);
}

/**
 * Resolve effective pin status for a sync run, honoring the --unpinned flag.
 *
 * When `unpinned` is true, configured pins are disabled so upstream versions
 * surface as behind/diverged — but package.json files stay pinned (their content
 * is reconciled separately by the packages service).
 */
export function isPinnedForSync(filePath: string, config: CellaCliConfig, unpinned?: boolean): boolean {
  if (isPackageJson(filePath)) return true;
  if (unpinned) return false;
  return isPinned(filePath, config);
}

/** Validation warning */
interface ConfigWarning {
  type: 'pinned-glob' | 'pinned-not-found' | 'ignored-not-found';
  pattern: string;
  message: string;
}

/**
 * Check if an entry contains glob characters (no longer supported).
 */
function hasGlobChars(entry: string): boolean {
  return entry.includes('*') || entry.includes('?');
}

/**
 * Validate config overrides and return warnings.
 *
 * Checks for:
 * - Pinned files using glob patterns (no longer supported)
 * - Pinned files that don't exist in fork
 * - Ignored folders that don't exist in fork
 *
 * @param config - The sync config to validate
 * @param forkPath - Path to the fork repository
 */
export function validateOverrides(config: CellaCliConfig, forkPath: string): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // Check pinned files
  const pinnedFiles = config.overrides?.pinnedFiles || [];
  for (const entry of pinnedFiles) {
    if (hasGlobChars(entry)) {
      warnings.push({
        type: 'pinned-glob',
        pattern: entry,
        message: `pin uses glob (not supported, use exact path): ${entry}`,
      });
    } else if (!existsSync(join(forkPath, entry))) {
      warnings.push({
        type: 'pinned-not-found',
        pattern: entry,
        message: `pin not found: ${entry}`,
      });
    }
  }

  // Check ignored folders
  const ignoredFolders = config.overrides?.ignoredFolders || [];
  for (const entry of ignoredFolders) {
    if (hasGlobChars(entry)) {
      warnings.push({
        type: 'ignored-not-found',
        pattern: entry,
        message: `ignored folder uses glob (not supported, use a folder path): ${entry}`,
      });
    } else if (!existsSync(join(forkPath, entry.replace(/\/+$/, '')))) {
      warnings.push({
        type: 'ignored-not-found',
        pattern: entry,
        message: `ignored folder not found: ${entry}`,
      });
    }
  }

  return warnings;
}

/**
 * Print validation warnings to console.
 */
export function printWarnings(warnings: ConfigWarning[]): void {
  for (const warning of warnings) {
    console.info(`${warningMark} ${warning.message}`);
  }
}

/**
 * Find all files matching ignored patterns from a file list.
 */
export function findIgnoredFiles(files: string[], config: CellaCliConfig): string[] {
  return files.filter((file) => isIgnored(file, config));
}

/**
 * Find all files matching pinned patterns from a file list.
 */
export function findPinnedFiles(files: string[], config: CellaCliConfig): string[] {
  return files.filter((file) => isPinned(file, config));
}
