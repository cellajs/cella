import { existsSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import pc from 'picocolors';
import { getGitFileHashes } from '../utils/git/files';
import type { OverridesConfig } from './types';

/**
 * Escapes all regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple glob pattern matching for file paths.
 * Supports * wildcard at end of pattern (e.g., 'info/*', 'frontend/public/static/*').
 */
function matchesPattern(pattern: string, filePath: string): boolean {
  if (pattern.endsWith('/*')) {
    // Directory wildcard: 'info/*' matches 'info/foo.md', 'info/bar/baz.ts'
    const dir = pattern.slice(0, -2);
    return filePath.startsWith(`${dir}/`);
  }
  if (pattern.includes('*')) {
    // Escape all regex metacharacters, then restore glob wildcard semantics
    const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(filePath);
  }
  // Exact match or directory prefix
  return filePath === pattern || filePath.startsWith(`${pattern}/`);
}

/**
 * Validates pattern against a set of file paths.
 * Returns true if pattern matches at least one file.
 */
function patternMatchesFiles(pattern: string, filePaths: string[]): boolean {
  return filePaths.some((file) => matchesPattern(pattern, file));
}

/**
 * Validates that files/patterns in overrides config actually exist.
 * - `pinned` files are validated against local filesystem (your customized files)
 * - `ignored` files are validated against upstream branch (files you're skipping)
 */
export async function validateOverridesConfig(
  overrides: OverridesConfig,
  workingDirectory: string,
  upstreamBranchRef?: string,
): Promise<{ valid: boolean; warnings: string[] }> {
  const warnings: string[] = [];

  // Validate pinned files against local filesystem
  for (const pattern of overrides.pinned) {
    const fullPattern = `${workingDirectory}/${pattern}`;

    if (pattern.includes('*')) {
      const matches: string[] = [];
      for await (const match of glob(fullPattern)) {
        matches.push(match);
      }
      if (matches.length === 0) {
        warnings.push(`Pinned pattern "${pattern}" does not match any local files`);
      }
    } else {
      if (!existsSync(fullPattern)) {
        warnings.push(`Pinned file "${pattern}" does not exist locally`);
      }
    }
  }

  // Validate ignored files against upstream (if branch ref provided)
  if (upstreamBranchRef && overrides.ignored.length > 0) {
    try {
      const upstreamFiles = await getGitFileHashes(workingDirectory, upstreamBranchRef);
      const upstreamPaths = upstreamFiles.map((f) => f.path);

      for (const pattern of overrides.ignored) {
        if (!patternMatchesFiles(pattern, upstreamPaths)) {
          warnings.push(`Ignored pattern "${pattern}" does not match any upstream files`);
        }
      }
    } catch {
      // If upstream branch not available (e.g., not fetched), skip validation
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Logs validation warnings to console.
 */
export function logValidationWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;

  console.warn(pc.yellow('\n⚠️  Overrides config validation warnings:'));
  for (const warning of warnings) {
    console.warn(`   • ${warning}`);
  }
  console.warn('');
}
