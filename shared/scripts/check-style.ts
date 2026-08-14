/**
 * Runs the terminology, documentation, and comment checks as a single blocking pass.
 * Clean sub-checks collapse into one `[style]` line; findings print their detail.
 * Exits non-zero on any finding: `pnpm check`, `pnpm lint`, and CI's style step all run this same pass, so they cannot diverge.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

interface SubCheck {
  label: string;
  script: string;
  args: string[];
}

const subChecks: SubCheck[] = [
  { label: 'terminology', script: 'check-app-vocabulary.ts', args: [] },
  { label: 'documentation', script: 'check-doc-style.ts', args: [] },
  // `--placement` runs the required comment rules and the placement rule in one pass.
  { label: 'comments', script: 'check-comment-style.ts', args: ['--placement'] },
];

const flagged = subChecks.filter((check) => {
  const result = spawnSync(process.execPath, [join(here, check.script), ...check.args], {
    encoding: 'utf8',
  });
  if (result.status === 0) return false;
  process.stderr.write((result.stdout ?? '') + (result.stderr ?? ''));
  return true;
});

if (flagged.length === 0) {
  console.log('[style] OK, terminology, documentation, and comments follow the required style.');
} else {
  console.error(`[style] ${flagged.length} area(s) failed (${flagged.map((check) => check.label).join(', ')}).`);
  process.exit(1);
}
