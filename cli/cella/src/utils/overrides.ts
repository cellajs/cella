/**
 * Override matching and validation utilities for sync CLI v2.
 *
 * Handles matching files against ignored/pinned patterns and
 * validates config for potential issues.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import type { CellaCliConfig } from '../config/types';

/**
 * Check if a pattern contains glob characters.
 */
export function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?');
}

/**
 * Match a file path against a glob-like pattern.
 *
 * Supported patterns:
 * - Exact match: 'path/to/file.ts'
 * - Wildcard: 'path/to/*' matches any file in that directory
 * - Deep wildcard: 'path/**' matches all files recursively
 *
 * @param filePath - The file path to test
 * @param pattern - The pattern to match against
 * @returns True if the file matches the pattern
 */
export function matchPattern(filePath: string, pattern: string): boolean {
  // Exact match (no glob characters)
  if (!isGlobPattern(pattern)) {
    return filePath === pattern;
  }

  // Convert glob pattern to regex
  // Escape special regex characters except * and ?
  let regexPattern = pattern.replace(/[-/\\^$+.()|[\]{}]/g, '\\$&');

  // Handle ** (recursive match)
  regexPattern = regexPattern.replace(/\*\*/g, '<<<DOUBLE_STAR>>>');
  // Handle * (single level match)
  regexPattern = regexPattern.replace(/\*/g, '[^/]*');
  // Restore ** as match-all
  regexPattern = regexPattern.replace(/<<<DOUBLE_STAR>>>/g, '.*');
  // Handle ?
  regexPattern = regexPattern.replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Check if a file is in the ignored list.
 */
export function isIgnored(filePath: string, config: CellaCliConfig): boolean {
  const patterns = config.overrides?.ignored || [];
  return patterns.some((pattern) => matchPattern(filePath, pattern));
}

/**
 * Check if a file is in the pinned list.
 */
export function isPinned(filePath: string, config: CellaCliConfig): boolean {
  const patterns = config.overrides?.pinned || [];
  return patterns.some((pattern) => matchPattern(filePath, pattern));
}

/**
 * Get override status for a file.
 */
export function getOverrideStatus(filePath: string, config: CellaCliConfig): { isIgnored: boolean; isPinned: boolean } {
  return {
    isIgnored: isIgnored(filePath, config),
    isPinned: isPinned(filePath, config),
  };
}

/** Validation warning */
export interface ConfigWarning {
  type: 'pinned-glob' | 'pinned-not-found' | 'ignored-no-match' | 'single-level-glob';
  pattern: string;
  message: string;
}

/**
 * Check if pattern uses single-level wildcard that likely should be recursive.
 * Patterns like 'dir/*' should probably be 'dir/**' for recursive matching.
 */
function shouldWarnSingleLevelGlob(pattern: string): boolean {
  return pattern.endsWith('/*') && !pattern.endsWith('/**');
}

/**
 * Validate config overrides and return warnings.
 *
 * Checks for:
 * - Pinned paths with glob patterns (should use ignored)
 * - Pinned paths that don't exist in fork
 * - Ignored patterns that don't match any files
 *
 * @param config - The sync config to validate
 * @param forkPath - Path to the fork repository
 * @param forkFiles - List of files in the fork (optional, for validation)
 * @param upstreamFiles - List of files in upstream (optional, for validation)
 */
export function validateOverrides(
  config: CellaCliConfig,
  forkPath: string,
  forkFiles?: string[],
  upstreamFiles?: string[],
): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // Check pinned paths
  const pinned = config.overrides?.pinned || [];
  for (const pattern of pinned) {
    // Warn if pinned contains glob pattern
    if (isGlobPattern(pattern)) {
      warnings.push({
        type: 'pinned-glob',
        pattern,
        message: `pin contains glob pattern (use ignored): ${pattern}`,
      });
    } else {
      // Check if path exists in fork
      const fullPath = join(forkPath, pattern);
      if (!existsSync(fullPath)) {
        warnings.push({
          type: 'pinned-not-found',
          pattern,
          message: `pin not found: ${pattern}`,
        });
      }
    }
  }

  // Check ignored patterns
  const ignored = config.overrides?.ignored || [];
  for (const pattern of ignored) {
    // Warn if pattern uses /* instead of /** for recursive matching
    if (shouldWarnSingleLevelGlob(pattern)) {
      warnings.push({
        type: 'single-level-glob',
        pattern,
        message: `pattern uses "/*" (single level) - use "/**" for recursive: ${pattern}`,
      });
    }

    // Check if pattern matches any files (only if we have file lists)
    if (forkFiles && upstreamFiles) {
      const allFiles = new Set([...forkFiles, ...upstreamFiles]);
      const hasMatch = Array.from(allFiles).some((file) => matchPattern(file, pattern));
      if (!hasMatch) {
        warnings.push({
          type: 'ignored-no-match',
          pattern,
          message: `no ignored match found: ${pattern}`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Print validation warnings to console.
 */
export function printWarnings(warnings: ConfigWarning[]): void {
  for (const warning of warnings) {
    console.info(`${pc.yellow('⚠')} ${warning.message}`);
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
