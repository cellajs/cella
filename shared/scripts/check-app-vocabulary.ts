/** Rejects source-control-oriented template terminology outside explicit compatibility files. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(here, '..', '..');
const disallowedTerm = /fork/gi;

/** Files and path prefixes (repo-root relative) exempt from the check. */
export interface VocabularyAllowlist {
  files: string[];
  prefixes: string[];
}

const templateAllowlist: VocabularyAllowlist = {
  files: [
    // release-please copies merged commit titles into the changelog verbatim, so any
    // title using the CLI's source-control term would otherwise fail the release PR.
    'CHANGELOG.md',
    'cella/CHANGELOG.md',
    'cella/cella.config.ts',
    // The cella-sync skill documents the CLI sync workflow and the app-side marker convention,
    // both of which use the CLI's source-control term. It must stay byte-identical with the
    // copies shipped to apps so `pnpm cella sync` reports it as identical.
    'cella/skills/cella-sync/SKILL.md',
    'shared/scripts/check-app-vocabulary.test.ts',
    'shared/scripts/check-app-vocabulary.ts',
  ],
  // Migration READMEs and the manifest address app maintainers pulling template
  // changes, an audience the CLI's source-control term describes precisely.
  prefixes: ['cella/migrations/'],
};

/** Relative to the repo root; `shared/config` never syncs, so the file is the app's to fill. */
const appAllowlistPath = 'shared/config/vocabulary-allowlist.ts';

export interface AppVocabularyFinding {
  file: string;
  line: number;
  column: number;
  term: string;
  location: 'content' | 'path';
}

function isAllowed(file: string, allowlist: VocabularyAllowlist): boolean {
  return allowlist.files.includes(file) || allowlist.prefixes.some((prefix) => file.startsWith(prefix));
}

export function findAppVocabularyFindings(
  file: string,
  source: string,
  allowlist: VocabularyAllowlist = templateAllowlist,
): AppVocabularyFinding[] {
  if (isAllowed(file, allowlist)) return [];

  const findings: AppVocabularyFinding[] = [];
  const pathPattern = new RegExp(disallowedTerm.source, disallowedTerm.flags);
  for (const match of file.matchAll(pathPattern)) {
    findings.push({
      file,
      line: 0,
      column: match.index + 1,
      term: match[0],
      location: 'path',
    });
  }

  const contentPattern = new RegExp(disallowedTerm.source, disallowedTerm.flags);
  for (const match of source.matchAll(contentPattern)) {
    const before = source.slice(0, match.index);
    const lastLineBreak = before.lastIndexOf('\n');
    findings.push({
      file,
      line: before.split('\n').length,
      column: match.index - lastLineBreak,
      term: match[0],
      location: 'content',
    });
  }
  return findings;
}

/** Template allowlist merged with the app's, when the app-owned file exists. */
export async function loadAllowlist(repoRoot = defaultRepoRoot): Promise<VocabularyAllowlist> {
  const path = join(repoRoot, appAllowlistPath);
  if (!existsSync(path)) return templateAllowlist;

  const module: { vocabularyAllowlist?: Partial<VocabularyAllowlist> } = await import(pathToFileURL(path).href);
  const app = module.vocabularyAllowlist ?? {};
  return {
    files: [...templateAllowlist.files, ...(app.files ?? [])],
    prefixes: [...templateAllowlist.prefixes, ...(app.prefixes ?? [])],
  };
}

function trackedFiles(repoRoot: string): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(join(repoRoot, file)))
    .sort();
}

export async function runAppVocabularyCheck(repoRoot = defaultRepoRoot): Promise<number> {
  const allowlist = await loadAllowlist(repoRoot);
  const findings = trackedFiles(repoRoot).flatMap((file) => {
    const source = readFileSync(join(repoRoot, file));
    if (source.includes(0)) return [];
    return findAppVocabularyFindings(file, source.toString('utf8'), allowlist);
  });

  if (findings.length === 0) {
    console.info('[app-vocabulary] OK, template and app terminology is consistent.');
    return 0;
  }

  console.error(`[app-vocabulary] ${findings.length} disallowed occurrence(s):`);
  for (const finding of findings) {
    const location = finding.location === 'path' ? finding.file : `${finding.file}:${finding.line}:${finding.column}`;
    console.error(`  ${location} replace "${finding.term}" with template/app terminology`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await runAppVocabularyCheck();
}
