import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { blankOut, repoRoot as defaultRepoRoot, type Finding, lineColumn } from './repo-files.ts';

const disallowedTerm = /fork/gi;
/** The product name as an identifier or wire string; prose may still contrast the template with the app. */
const productNameInLogic = /cella_[a-z0-9]|\bCella[A-Z]|cellajs\.com|_cella-/g;
/** Logic roots the product-name rule covers; tests, config, docs and the marketing site are the template's own voice. */
const logicRoots = ['backend/src/', 'shared/src/', 'frontend/src/'];
const productNameAllowlist: VocabularyAllowlist = {
  files: [],
  prefixes: ['frontend/src/modules/marketing/', 'frontend/src/content/'],
};
/**
 * The app-side marker the cella-sync skill puts on intentional app edits: `// fork: <why>`, the css/md forms and a
 * ` * fork: <why>` line inside a JSDoc block. YAML has a `# fork: <why>` line, which elsewhere could be a private field.
 */
const markerComment = /\/\/[ \t]*fork:[^\n]*|\/\*[ \t]*fork:[\s\S]*?\*\/|<!--[ \t]*fork:[\s\S]*?-->|^[ \t]*\*[ \t]*fork:[^\n]*/gim;
/** The YAML marker: a comment starts a line or follows whitespace, and a `#` inside a value is text. */
const yamlMarkerComment = /(^|[ \t])#[ \t]*fork:[^\n]*/gim;
const sourceControlAdvice = 'use template/app terminology';
const productNameAdvice = 'derive it from appConfig or use a neutral name; the product name is not an identifier or wire string';

/** Files and path prefixes (repo-root relative) exempt from the check. */
export interface VocabularyAllowlist {
  files: string[];
  prefixes: string[];
  /** Path prefixes the comment and doc checks skip, such as reference code the app keeps but does not maintain. */
  proseExclude?: string[];
  /** Class names the app keeps as hooks with no Tailwind utility or stylesheet rule behind them, each with its reason. */
  markerClasses?: Record<string, string>;
}

const templateAllowlist: VocabularyAllowlist = {
  files: [
    // release-please copies merged commit titles verbatim, so a title with the CLI's term must not fail the release PR
    'CHANGELOG.md',
    'cella/CHANGELOG.md',
    'cella/cella.config.ts',
    // The cella-sync skill documents the CLI's sync workflow and the app-side marker, both in the CLI's term; it stays
    // byte-identical with the apps' copies, so `pnpm cella sync` reports it as identical
    'cella/skills/cella-sync/SKILL.md',
    'shared/scripts/check-app-vocabulary.ts',
  ],
  // Alignment READMEs address app maintainers pulling template changes, whom the CLI's term describes precisely
  prefixes: ['cella/alignments/'],
};

/** Relative to the repo root; `shared/config` never syncs, so the file is the app's to fill. */
const appAllowlistPath = 'shared/config/vocabulary-allowlist.ts';

function isAllowed(file: string, allowlist: VocabularyAllowlist): boolean {
  return allowlist.files.includes(file) || allowlist.prefixes.some((prefix) => file.startsWith(prefix));
}

/** The CLI's source-control term in a file's path and text, outside the sync markers and the allowlisted files. */
export function vocabularyFindings(file: string, source: string, allowlist: VocabularyAllowlist = templateAllowlist): Finding[] {
  if (isAllowed(file, allowlist)) return [];

  const finding = (term: string) => ({ file, rule: 'source-control-term', term, message: sourceControlAdvice });
  const markers = source.replace(markerComment, blankOut);
  const scanned = /\.ya?ml$/.test(file) ? markers.replace(yamlMarkerComment, blankOut) : markers;
  return [
    ...[...file.matchAll(disallowedTerm)].map((match) => finding(match[0])),
    ...[...scanned.matchAll(disallowedTerm)].map((match) => ({ ...finding(match[0]), ...lineColumn(scanned, match.index) })),
  ];
}

/** An identifier, claim or URL carrying the product name: an app derives such names from `appConfig` or picks a neutral one. */
export function productNameFindings(file: string, source: string): Finding[] {
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
    markerClasses: app.markerClasses ?? {},
  };
}
