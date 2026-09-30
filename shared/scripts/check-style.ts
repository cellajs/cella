/**
 * Runs the terminology, documentation, comment and frontend checks as one blocking pass. Clean sub-checks
 * collapse into a single `[style]` line; findings print their detail. Exits non-zero on any
 * finding. `pnpm check`, `pnpm lint` and CI's style step all run this same pass.
 */
import { runAppVocabularyCheck } from './check-app-vocabulary.ts';
import { runCommentCheck } from './check-comment-style.ts';
import { runDocStyleCheck } from './check-doc-style.ts';
import { runFrontendCheck } from './check-frontend-style.ts';
import type { Output } from './repo-files.ts';
import { keepParses } from './source-comments.ts';

const subChecks: { label: string; run: (output: Output) => number | Promise<number> }[] = [
  { label: 'terminology', run: (output) => runAppVocabularyCheck(undefined, output) },
  { label: 'documentation', run: (output) => runDocStyleCheck(undefined, false, output) },
  // `--placement` runs the required comment rules and the placement rule in one pass.
  { label: 'comments', run: (output) => runCommentCheck(['--placement'], output) },
  { label: 'frontend', run: (output) => runFrontendCheck([], output) },
];

// The comment check parses the frontend sources the frontend check reads next.
keepParses('frontend/src/');
const flagged: string[] = [];
for (const check of subChecks) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = await check.run({ log: (line) => stdout.push(line), error: (line) => stderr.push(line) });
  if (status === 0) continue;
  process.stderr.write([...stdout, ...stderr].map((line) => `${line}\n`).join(''));
  flagged.push(check.label);
}

if (flagged.length === 0) {
  console.log('[style] OK, terminology, documentation, comments and frontend code follow the required style.');
} else {
  console.error(`[style] ${flagged.length} area(s) failed (${flagged.join(', ')}).`);
  process.exitCode = 1;
}
