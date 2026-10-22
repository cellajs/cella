/**
 * Row stamps are written one way, `getIsoDate()` for a moment and `updateStamps()` / `deleteStamps()` for a row's last
 * write and tombstone (AGENTS.md, Coding patterns): this flags backend code that stamps by hand. A table without a
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

/** A stamp value written by hand: the clock, a local holding it, or a sibling stamp. */
const stampValue = String.raw`(?:getIsoDate\(\)|new Date\b[^,}]*|sql\x60now\(\)\x60|now\b|deletedAt\b|at\b)`;

const rules: { pattern: RegExp; rule: string; message: string }[] = [
  {
    pattern: /new Date\(\)\.toISOString\(\)/g,
    rule: 'stamp-clock',
    message: 'use getIsoDate() for the current moment',
  },
  {
    // The pair in one object literal, in either order: a lone `updatedBy` in an option bag is not a write.
    pattern: new RegExp(
      String.raw`\bupdatedAt:\s*${stampValue}\s*,\s*updatedBy:|\bupdatedBy:\s*[\w.]+\s*,\s*updatedAt:\s*${stampValue}|\bdeletedAt:\s*${stampValue}\s*,\s*deletedBy:|\bdeletedBy:\s*[\w.]+\s*,\s*deletedAt:\s*${stampValue}`,
      'g',
    ),
    rule: 'stamp-pair',
    message: 'spread updateStamps(actorId) or deleteStamps(actorId) instead of writing the pair by hand',
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
