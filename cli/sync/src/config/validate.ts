import { existsSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import pc from 'picocolors';
import type { OverridesConfig } from './types';

/**
 * Validates that files/patterns in overrides config actually exist in the filesystem.
 * Warns about patterns that don't match any files.
 */
export async function validateOverridesConfig(
  overrides: OverridesConfig,
  workingDirectory: string,
): Promise<{ valid: boolean; warnings: string[] }> {
  const warnings: string[] = [];

  const allPatterns = [...overrides.customized, ...overrides.ignored];

  for (const pattern of allPatterns) {
    const fullPattern = `${workingDirectory}/${pattern}`;

    // For glob patterns, check if they match anything
    if (pattern.includes('*')) {
      const matches: string[] = [];
      for await (const match of glob(fullPattern)) {
        matches.push(match);
      }
      if (matches.length === 0) {
        warnings.push(`Pattern "${pattern}" does not match any files`);
      }
    } else {
      // For exact paths, check existence
      if (!existsSync(fullPattern)) {
        warnings.push(`File "${pattern}" does not exist`);
      }
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
    console.warn(pc.yellow(`   • ${warning}`));
  }
  console.warn('');
}
