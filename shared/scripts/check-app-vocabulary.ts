/**
 * Rejects source-control-oriented template terminology outside explicit compatibility files, and the template's product
 * name in identifiers and wire strings of app logic (claims, headers, DNS records, URLs), which an app would otherwise
 * ship to its own users.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(here, '..', '..');
const disallowedTerm = /fork/gi;
/** The product name as an identifier or wire string; prose may still contrast the template with the app. */
const productNameInLogic = /cella_[a-z0-9]|\bCella[A-Z]|cellajs\.com|_cella-/g;
/** Logic roots the product-name rule covers; tests, config, docs and the marketing site are the template's own voice. */
const logicRoots = ['backend/src/', 'shared/src/', 'frontend/src/'];
const productNameAllowlist: VocabularyAllowlist = {
  files: ['shared/src/cli-utils/display.ts'],
  prefixes: ['frontend/src/modules/marketing/', 'frontend/src/content/'],
};
/** The app-side marker the cella-sync skill puts on intentional app edits: `// fork: <why>` and the css/md forms. */
const markerComment = /\/\/[ \t]*fork:[^\n]*|\/\*[ \t]*fork:[\s\S]*?\*\/|<!--[ \t]*fork:[\s\S]*?-->/gi;

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
  rule: 'source-control-term' | 'product-name';
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
      rule: 'source-control-term',
    });
  }

  // Blank the markers to same-length whitespace so line and column numbers of real findings hold.
  const scanned = source.replace(markerComment, (marker) => marker.replace(/[^\n]/g, ' '));
  const contentPattern = new RegExp(disallowedTerm.source, disallowedTerm.flags);
  for (const match of scanned.matchAll(contentPattern)) {
    const before = scanned.slice(0, match.index);
    const lastLineBreak = before.lastIndexOf('\n');
    findings.push({
      file,
      line: before.split('\n').length,
      column: match.index - lastLineBreak,
      term: match[0],
      location: 'content',
      rule: 'source-control-term',
    });
  }
  return findings;
}

/** An identifier, claim or URL carrying the product name: an app derives such names from `appConfig` or picks a neutral one. */
export function findProductNameFindings(file: string, source: string): AppVocabularyFinding[] {
  const inLogic = logicRoots.some((root) => file.startsWith(root)) && !/\.test\.tsx?$/.test(file);
  if (!inLogic || isAllowed(file, productNameAllowlist)) return [];

  const findings: AppVocabularyFinding[] = [];
  const pattern = new RegExp(productNameInLogic.source, productNameInLogic.flags);
  for (const match of source.matchAll(pattern)) {
    const before = source.slice(0, match.index);
    findings.push({
      file,
      line: before.split('\n').length,
      column: match.index - before.lastIndexOf('\n'),
      term: match[0],
      location: 'content',
      rule: 'product-name',
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
    const text = source.toString('utf8');
    return [...findAppVocabularyFindings(file, text, allowlist), ...findProductNameFindings(file, text)];
  });

  if (findings.length === 0) {
    console.info('[app-vocabulary] OK, template and app terminology is consistent.');
    return 0;
  }

  console.error(`[app-vocabulary] ${findings.length} disallowed occurrence(s):`);
  for (const finding of findings) {
    const location = finding.location === 'path' ? finding.file : `${finding.file}:${finding.line}:${finding.column}`;
    const advice =
      finding.rule === 'product-name'
        ? 'derive from appConfig or use a neutral name; the product name is not an identifier or wire string'
        : 'with template/app terminology';
    console.error(`  ${location} replace "${finding.term}" ${advice}`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await runAppVocabularyCheck();
}
