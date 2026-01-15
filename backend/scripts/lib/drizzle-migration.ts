/**
 * Drizzle Migration Utilities
 *
 * Shared utilities for programmatically managing Drizzle migrations.
 * Used by scripts that generate SQL migrations (CDC setup, triggers, etc.).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chalk from 'chalk';

// Go up two levels: lib -> scripts -> backend, then into drizzle
const drizzleDir = join(import.meta.dirname, '../../drizzle');
const journalPath = join(drizzleDir, 'meta/_journal.json');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface MigrationResult {
  filename: string;
  path: string;
  tag: string;
  updated: boolean;
}

/**
 * Read the Drizzle migration journal.
 */
export function readJournal(): Journal {
  return JSON.parse(readFileSync(journalPath, 'utf-8')) as Journal;
}

/**
 * Write the Drizzle migration journal.
 */
export function writeJournal(journal: Journal): void {
  writeFileSync(journalPath, JSON.stringify(journal, null, 2));
}

/**
 * Find an existing migration entry by tag suffix.
 * @param journal - The migration journal
 * @param tagSuffix - The tag suffix to search for (e.g., 'cdc_setup')
 */
export function findMigrationByTag(journal: Journal, tagSuffix: string): JournalEntry | undefined {
  return journal.entries.find((e) => e.tag.endsWith(tagSuffix));
}

/**
 * Resolve SQL content from either a file path or inline SQL string.
 * @param sqlOrPath - SQL content or path to a .sql file
 */
export function resolveSqlContent(sqlOrPath: string): string {
  const possiblePath = resolve(sqlOrPath);
  if (existsSync(possiblePath) && possiblePath.endsWith('.sql')) {
    return readFileSync(possiblePath, 'utf-8');
  }
  return sqlOrPath;
}

/**
 * Add or update a SQL migration in the Drizzle migrations folder.
 *
 * @param tag - Unique identifier for the migration (e.g., 'cdc_setup', 'activity_notify_trigger')
 * @param sql - SQL content (not a file path - use resolveSqlContent first if needed)
 * @returns Object containing the filename, path, tag, and whether it was an update
 */
export function upsertMigration(tag: string, sql: string): MigrationResult {
  // Normalize tag (remove leading numbers/underscores if present)
  const normalizedTag = tag.replace(/^\d+_/, '');

  const journal = readJournal();

  // Check if migration with this tag already exists
  const existingEntry = findMigrationByTag(journal, normalizedTag);

  if (existingEntry) {
    // Update existing migration file
    const filename = `${existingEntry.tag}.sql`;
    const path = join(drizzleDir, filename);

    writeFileSync(path, sql);

    return { filename, path, tag: existingEntry.tag, updated: true };
  }

  // Create new migration with Drizzle naming convention
  const nextIdx = journal.entries.length;
  const fullTag = `${String(nextIdx).padStart(4, '0')}_${normalizedTag}`;
  const filename = `${fullTag}.sql`;
  const path = join(drizzleDir, filename);

  // Write the migration file
  writeFileSync(path, sql);

  // Add entry to journal
  journal.entries.push({
    idx: nextIdx,
    version: journal.version,
    when: Date.now(),
    tag: fullTag,
    breakpoints: true,
  });

  writeJournal(journal);

  return { filename, path, tag: fullTag, updated: false };
}

/**
 * Log a migration result to the console.
 */
export function logMigrationResult(result: MigrationResult, context?: string): void {
  console.info('');
  const action = result.updated ? 'updated' : 'created';
  const contextStr = context ? ` (${context})` : '';
  console.info(`${chalk.greenBright.bold('✔')} Migration ${action}${contextStr}: drizzle/${result.filename}`);
}
