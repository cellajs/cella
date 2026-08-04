/**
 * Runs the terminology, documentation, and comment checks as a single non-blocking pass.
 * Clean sub-checks collapse into one `[style]` line; findings print their detail.
 * Always exits 0 so findings surface as warnings during `pnpm check` without breaking the build.
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
  console.warn(
    `[style] ${flagged.length} area(s) reported warnings (${flagged
      .map((check) => check.label)
      .join(', ')}); not blocking the build.`,
  );
}
