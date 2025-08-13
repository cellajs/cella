import fs from 'fs';
import type { ZwizzleFile, ZwizzleEntry } from '../../types/zwizzle';
import { zwizzleConfig } from '../../config';

export function initZwizzle(entries: ZwizzleEntry[]) {
  if (!entries.length) return; // nothing to write

  let existing: ZwizzleFile = { version: '1.0.0', entries: [] };

  if (fs.existsSync(zwizzleConfig.filePath)) {
    existing = JSON.parse(fs.readFileSync(zwizzleConfig.filePath, 'utf8'));
  }

  // Merge: avoid duplicates
  const mergedEntries = [
    ...existing.entries.filter(e => !entries.find(n => n.filePath === e.filePath)),
    ...entries
  ];

  const updated: ZwizzleFile = { ...existing, entries: mergedEntries };
  fs.writeFileSync(zwizzleConfig.filePath, JSON.stringify(updated, null, 2));
}