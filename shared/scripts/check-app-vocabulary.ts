/**
 * Rejects source-control-oriented template terminology outside explicit compatibility files, and the template's product
 * name in identifiers and wire strings of app logic (claims, headers, DNS records, URLs), which an app would otherwise
 * ship to its own users.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot as defaultRepoRoot, type Finding, lineColumn } from './repo-files.ts';

const disallowedTerm = /fork/gi;
/** The product name as an identifier or wire string; prose may still contrast the template with the app. */
const productNameInLogic = /cella_[a-z0-9]|\bCella[A-Z]|cellajs\.com|_cella-/g;
/** Logic roots the product-name rule covers; tests, config, docs and the marketing site are the template's own voice. */
const logicRoots = ['backend/src/', 'shared/src/', 'frontend/src/'];
const productNameAllowlist: VocabularyAllowlist = {
  files: ['shared/src/cli-utils/display.ts'],
  prefixes: ['frontend/src/modules/marketing/', 'frontend/src/content/'],
};
/**
 * The app-side marker the cella-sync skill puts on intentional app edits: `// fork: <why>`, the css/md forms and a
 * ` * fork: <why>` line inside a JSDoc block.
 */
const markerComment = /\/\/[ \t]*fork:[^\n]*|\/\*[ \t]*fork:[\s\S]*?\*\/|<!--[ \t]*fork:[\s\S]*?-->|^[ \t]*\*[ \t]*fork:[^\n]*/gim;
const sourceControlAdvice = 'use template/app terminology';
const productNameAdvice = 'derive it from appConfig or use a neutral name; the product name is not an identifier or wire string';

/** Files and path prefixes (repo-root relative) exempt from the check. */
export interface VocabularyAllowlist {
  files: string[];
  prefixes: string[];
  /** Path prefixes the comment and doc checks skip, such as reference code the app keeps but does not maintain. */
  proseExclude?: string[];
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

function isAllowed(file: string, allowlist: VocabularyAllowlist): boolean {
  return allowlist.files.includes(file) || allowlist.prefixes.some((prefix) => file.startsWith(prefix));
}

export function findAppVocabularyFindings(file: string, source: string, allowlist: VocabularyAllowlist = templateAllowlist): Finding[] {
  if (isAllowed(file, allowlist)) return [];

  const finding = (term: string) => ({ file, rule: 'source-control-term', term, message: sourceControlAdvice });
  // Blank the markers to same-length whitespace so line and column numbers of real findings hold.
  const scanned = source.replace(markerComment, (marker) => marker.replace(/[^\n]/g, ' '));
  return [
    ...[...file.matchAll(disallowedTerm)].map((match) => finding(match[0])),
    ...[...scanned.matchAll(disallowedTerm)].map((match) => ({ ...finding(match[0]), ...lineColumn(scanned, match.index) })),
  ];
}

/** An identifier, claim or URL carrying the product name: an app derives such names from `appConfig` or picks a neutral one. */
export function findProductNameFindings(file: string, source: string): Finding[] {
  const inLogic = logicRoots.some((root) => file.startsWith(root)) && !/\.test\.tsx?$/.test(file);
  if (!inLogic || isAllowed(file, productNameAllowlist)) return [];
  return [...source.matchAll(productNameInLogic)].map((match) => ({
    file,
    ...lineColumn(source, match.index),
    rule: 'product-name',
    term: match[0],
    message: productNameAdvice,
  }));
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
    proseExclude: app.proseExclude ?? [],
  };
}
