/**
 * Row stamps are written one way, `getIsoDate()` for a moment and `updateStamps()` / `deleteStamps()` for a row's last
 * write and tombstone (ARCHITECTURE.md, Row stamps): this flags backend code that stamps by hand. A table without a
 * writer (`updatedAt` alone) still stamps with `getIsoDate()`.
 */
import type { Finding } from './repo-files.ts';

/** Backend sources outside the two helpers, tests, mocks and seeds. */
function isStampedSource(file: string): boolean {
  return (
    /^backend\/src\/.*\.ts$/.test(file) &&
    !/\.(?:test|mocks?)\.ts$/.test(file) &&
    !file.endsWith('/utils/iso-date.ts') &&
    !file.endsWith('/db/utils/stamps.ts')
  );
}

const rules: { pattern: RegExp; rule: string; message: string }[] = [
  {
    pattern: /new Date\(\)\.toISOString\(\)/g,
    rule: 'stamp-clock',
    message: 'use getIsoDate() for the current moment',
  },
  {
    pattern:
      /\b(?:updatedAt|deletedAt):\s*(?:new Date\b|sql`now\(\)`|deletedAt\b|now\b)|\bdeletedAt:\s*getIsoDate\(\)|\bupdatedBy:\s*(?:ctx\.|actorId\b|user\.id\b|deletedBy\b)/g,
    rule: 'stamp-pair',
    message: 'spread updateStamps(actorId) or deleteStamps(actorId) instead of writing the stamp by hand',
  },
];

/** The stamp findings of one file. */
export function stampFindings(file: string, source: string): Finding[] {
  if (!isStampedSource(file)) return [];
  const findings: Finding[] = [];
  for (const { pattern, rule, message } of rules) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      findings.push({ file, line, column: 1, rule, term: match[0], message });
    }
  }
  return findings;
}
