/**
 * Codemod: delete comments that restate the code they sit on.
 *
 * Four independent rules, each reported separately by `inventory` so an app can see what a
 * `rewrite` would remove before running it:
 *
 *   name-restating   a declaration or member doc whose words are already in the identifier
 *                    ("Mutation hook for creating a new attachment" on `useAttachmentCreateMutation`)
 *   boilerplate      a doc matching a curated template phrase, carrying no local information
 *                    ("Attachment query keys.", "Props for the X component.")
 *   near-empty       a three-word-or-shorter doc on a member whose type is already named
 *                    ("State tracking" on `_state: WebSocketState`). Members typed `unknown`,
 *                    `any`, or a bare `string`/`number`/`boolean` are exempt: those types pin
 *                    down nothing, so even a terse doc may be the member's only specification.
 *                    Section banners and docs stating a default or condition are exempt too.
 *                    OPT-IN: across this repo it found 11 candidates and about a third of those
 *                    still carried a fact the member needed (a `key -> value` shape, a state
 *                    qualifier). Read its inventory and apply by hand; the yield does not
 *                    justify an unattended rewrite.
 *   duplicate        an identical short doc repeated across `--dup-threshold` files or more,
 *                    which is how a module cloned from a sibling inherits its comments.
 *                    REPORT ONLY by default: it cannot tell a copied note from the same local
 *                    pattern recurring (each module's `query.ts` really does exclude `include`
 *                    from its own cache key), and deleting every copy loses the note. Read its
 *                    inventory as a list of hoisting candidates, then move each one by hand.
 *
 * Judgment cases are out of scope on purpose: a comment that states a constraint the reader
 * cannot see stays, and shortening a long one is a human edit. This only removes comments whose
 * whole content is recoverable from the identifier next to them.
 *
 * Protected and never touched: tool directives (biome-ignore, ts-expect-error, v8 ignore,
 * vite/webpack magic comments), any JSDoc carrying an `@tag`, TODO/FIXME/HACK, cella `fork:`
 * sync markers, license headers, and generated trees.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/trim-comment-budget.ts inventory <roots…>
 *   pnpm exec tsx cella/migrations/<id>/trim-comment-budget.ts inventory <roots…> --verbose
 *   pnpm exec tsx cella/migrations/<id>/trim-comment-budget.ts rewrite   <roots…>
 *   pnpm exec tsx cella/migrations/<id>/trim-comment-budget.ts rewrite   <roots…> --rules name,boilerplate
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Trees whose comments are generated, replayed, or translated; never rewritten by hand. */
const EXCLUDED_PATHS = [
  'node_modules/',
  'backend/drizzle/',
  'cella/migrations/',
  'locales/',
  'sdk/gen/',
  'dist/',
  '.gen.',
  'routeTree.gen',
  // Storybook renders the JSDoc above `meta` and above each story export as the description
  // shown in the docs UI, so these comments are a published surface, not code commentary.
  '.stories.',
];

/** A comment carrying any of these is load-bearing for a tool, a reader, or the sync CLI. */
const PROTECTED_PATTERNS = [
  /\bbiome-ignore\b/,
  /\b(?:ts-expect-error|ts-ignore|ts-nocheck|ts-check)\b/,
  /\beslint-(?:disable|enable)\b/,
  /\boxlint-disable\b/,
  /\bprettier-ignore\b/,
  /\b(?:v8|c8|istanbul|node) ignore\b/,
  /\bknip-ignore\b/,
  /\bwebpackChunkName\b/,
  /@vite-ignore/,
  /@__PURE__|#__PURE__/,
  /<reference\s/,
  /@license|@preserve|copyright|licensed under/i,
  /sourceMappingURL/,
  /\bfork:/,
  /\b(?:TODO|FIXME|HACK|XXX|WARNING|CAUTION|SAFETY|IMPORTANT)\b/,
  /@jsx|@flow/,
  // Any JSDoc tag (@param, @returns, @deprecated, @default, @openapi, @example…), on its own line
  // or inline in a single-line doc such as `/** @default true */`. Deliberately greedy: a comment
  // wrongly protected costs nothing, one wrongly deleted loses a contract a tool or reader needs.
  /(?:^|[\s*{])@[a-z]\w*/i,
  /\beslint\b/,
];

/** Curated template phrases that describe the declaration's shape, never its behavior. */
const BOILERPLATE_PATTERNS = [
  /^(?:react\s+)?(?:custom\s+)?(?:mutation|query)\s+hook\s+(?:for|to|that)\b/i,
  /^(?:infinite\s+)?query\s+options?\s+(?:for|to)\b/i,
  /^\w[\w\s]*\bquery keys\.?$/i,
  /^(?:the\s+)?props\s+(?:for|of)\b/i,
  /^(?:type|interface|schema|enum|constant|helper|utility|wrapper)\s+(?:for|of|that|to)\b/i,
  /^(?:a\s+|the\s+)?(?:react\s+)?component\s+(?:for|that|which)\b/i,
  /^(?:renders?|displays?|returns?)\s+(?:a|an|the)\b.{0,40}$/i,
  /^(?:handles?|manages?)\s+(?:the\s+)?\w+\.?$/i,
  /^(?:helper|utility)\s+function\b/i,
  /^-{2,}\s*[\w\s]+\s*-{2,}$/, // "--- Mutations ---" section banners
];

/**
 * Words that qualify the identifier rather than repeat it. "Soft-delete materials by IDs" on
 * `deleteMaterialsByIds` scores as a restatement, but `soft` is the whole point of the sentence.
 * A comment carrying one of these that the identifier does not is never deleted.
 */
const QUALIFIER_WORDS = new Set([
  'soft', 'hard', 'deep', 'shallow', 'partial', 'atomic', 'idempotent', 'optimistic', 'pessimistic',
  'recursive', 'batch', 'bulk', 'cascading', 'cascade', 'unwrapped', 'unwrap', 'nested', 'flat',
  'stale', 'cached', 'lazy', 'eager', 'sorted', 'unsorted', 'reverse', 'ascending', 'descending',
  'exclusive', 'inclusive', 'signed', 'unsigned', 'encrypted', 'hashed', 'sanitized', 'escaped',
  'debounced', 'throttled', 'memoized', 'paginated', 'offline', 'realtime', 'readonly', 'mutable',
  'immutable', 'nullable', 'required', 'client', 'server', 'never', 'only', 'must', 'cannot',
]);

/** Above this many content words a template phrase is a prefix on a real sentence, not the whole doc. */
const BOILERPLATE_MAX_WORDS = 8;

/** A member doc this short on a named type restates the member ("State tracking" on `_state`). */
const NEAR_EMPTY_MAX_WORDS = 3;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'this', 'that', 'is', 'are', 'be',
  'with', 'by', 'its', 'it', 'when', 'from', 'as', 'new', 'single', 'given', 'via', 'all', 'any',
  'we', 'us', 'our', 'you', 'your', 'if', 'so', 'at', 'into', 'per', 'each', 'one', 'used', 'use',
]);

/** Morphological folds so "creating"/"creates"/"create" and "props"/"property" compare equal. */
const STEMS: Record<string, string> = {
  props: 'prop', properties: 'prop', property: 'prop', component: 'component', components: 'component',
  hooks: 'hook', queries: 'query', mutations: 'mutation', options: 'option', ids: 'id', keys: 'key',
  creating: 'create', creates: 'create', created: 'create', deleting: 'delete', deletes: 'delete',
  deleted: 'delete', updating: 'update', updates: 'update', updated: 'update', renders: 'render',
  rendering: 'render', returns: 'return', returning: 'return', fetches: 'fetch', fetching: 'fetch',
  fetched: 'fetch', builds: 'build', building: 'build', resolves: 'resolve', resolving: 'resolve',
  handles: 'handle', handling: 'handle', validates: 'validate', validating: 'validate',
};

const stem = (word: string) => STEMS[word] ?? (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);

const proseWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map(stem);

/**
 * Every word the doc actually contains, including backticked symbols. `proseWords` drops those
 * so an identifier mentioned in prose cannot inflate the name-ratio, but the boilerplate guard
 * needs the true length: "Helper for `x.config.ts`: typed identity preserving literal keys" is a
 * template prefix on a real sentence, not a template phrase.
 */
const rawWordCount = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word)).length;

const identifierWords = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map(stem);

/** Comment body with the delimiters and per-line `*` gutter removed, one entry per prose line. */
function proseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*\/\/\/?\s?/, '')
        .replace(/^\s*\/\*\*?\s?/, '')
        .replace(/^\s*\*\/?\s?/, '')
        .replace(/\s*\*\/$/, '')
        .trim(),
    )
    .filter(Boolean);
}

function isProtected(text: string): boolean {
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(text));
}

interface Candidate {
  file: string;
  pos: number;
  end: number;
  line: number;
  rule: 'name' | 'boilerplate' | 'near-empty' | 'duplicate';
  owner: string;
  body: string;
  /** Interface, type-literal, or class member: judged by the member rule, not the function one. */
  isMember: boolean;
  /** Declared type as written, empty when inferred. A named type can carry the doc's meaning. */
  typeText: string;
}

/**
 * Whether the declared type pins the contract down on its own. `unknown`/`any` say nothing, and a
 * bare `string`/`number`/`boolean` says almost nothing, so a doc on those is often the only
 * specification the member has. A named type usually carries the meaning by itself.
 */
function typeIsNamed(typeText: string): boolean {
  const text = typeText.replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^(?:unknown|any|object|\{\s*\})$/.test(text)) return false;
  return !/^(?:string|number|boolean|Date)(?:\s*\[\])?(?:\s*\|\s*(?:null|undefined))*$/.test(text);
}

/**
 * A short noun phrase with no verb and no closing period is a section banner grouping members in
 * a long interface ("Dimensions props", "Authentication", "Grid and data Props"), not a doc on the
 * member it happens to sit above. Deleting one silently reflows the reader's map of the interface,
 * so leave banners for a human who can see the whole shape.
 */
const BANNER_PATTERN = /^[\w-]+(?:[\s&]+[\w-]+)*$/;

/**
 * A default or a conditional contract survives at any length: those are exactly the facts a name
 * and type cannot carry. "Defaults to window." is three words and is the only place that fact
 * appears in the file.
 */
const KEEPS_MEANING_PATTERN = /\bdefaults?\b|\bwhen\b|\bunless\b|\bkeyed by\b|\boverride\b|\bfrom\b|→|->/i;

/** Declarations whose leading doc this codemod is willing to judge against the identifier. */
function declaredName(node: ts.Node): string | null {
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isEnumMember(node)
  ) {
    const name = node.name;
    return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : null;
  }
  return null;
}

function collectFiles(root: string, out: string[]) {
  if (EXCLUDED_PATHS.some((part) => root.includes(part))) return;
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(root);
  } catch {
    return;
  }
  if (stat.isFile()) {
    if (SOURCE_EXTENSIONS.has(extname(root))) out.push(root);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    collectFiles(join(root, entry), out);
  }
}

/** Every leading comment attached to a named declaration, with its owner resolved. */
function candidatesIn(file: string, source: string, maxProseLines: number): Candidate[] {
  const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const found: Candidate[] = [];
  const seen = new Set<number>();

  const visit = (node: ts.Node) => {
    const owner = declaredName(node);
    if (owner) {
      for (const range of ts.getLeadingCommentRanges(source, node.pos) ?? []) {
        if (seen.has(range.pos)) continue;
        seen.add(range.pos);
        const text = source.slice(range.pos, range.end);
        if (isProtected(text)) continue;
        const lines = proseLines(text);
        if (!lines.length || lines.length > maxProseLines) continue;
        const isMember = ts.isPropertySignature(node) || ts.isPropertyDeclaration(node);
        found.push({
          file,
          pos: range.pos,
          end: range.end,
          line: source.slice(0, range.pos).split('\n').length,
          rule: 'name',
          owner,
          body: lines.join(' '),
          isMember,
          typeText: isMember && node.type ? node.type.getText(sourceFile) : '',
        });
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return found;
}

/** Cut the comment plus the whitespace line it occupied, keeping the declaration's indentation. */
function removeRanges(source: string, ranges: { pos: number; end: number }[]): string {
  let result = source;
  for (const range of [...ranges].sort((a, b) => b.pos - a.pos)) {
    let start = range.pos;
    while (start > 0 && (result[start - 1] === ' ' || result[start - 1] === '\t')) start -= 1;
    let stop = range.end;
    if (result[stop] === '\r') stop += 1;
    if (result[stop] === '\n') stop += 1;
    result = result.slice(0, start) + result.slice(stop);
  }
  return result;
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: trim-comment-budget.ts <inventory|rewrite> <roots…> [--rules name,boilerplate,duplicate]');
    console.error('       [--dup-threshold N] [--name-ratio 0.6] [--max-lines 2] [--verbose]');
    process.exit(1);
  }

  const flag = (name: string, fallback: string) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? fallback : (argv[index + 1] ?? fallback);
  };
  const verbose = argv.includes('--verbose');
  const enabled = new Set(flag('rules', 'name,boilerplate').split(','));
  const dupThreshold = Number(flag('dup-threshold', '3'));
  const nameRatio = Number(flag('name-ratio', '0.6'));
  const maxProseLines = Number(flag('max-lines', '2'));

  const roots = argv.slice(1).filter((arg, index, list) => {
    if (arg.startsWith('--')) return false;
    return !list[index - 1]?.startsWith('--') || list[index - 1] === '--verbose';
  });
  if (!roots.length) {
    console.error('No roots given.');
    process.exit(1);
  }

  const files: string[] = [];
  for (const root of roots) collectFiles(root, files);

  // Pass 1: gather every judgeable comment so the duplicate rule can count across files.
  const all: Candidate[] = [];
  const sources = new Map<string, string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    sources.set(file, source);
    all.push(...candidatesIn(file, source, maxProseLines));
  }

  const filesPerBody = new Map<string, Set<string>>();
  for (const candidate of all) {
    if (!filesPerBody.has(candidate.body)) filesPerBody.set(candidate.body, new Set());
    filesPerBody.get(candidate.body)?.add(candidate.file);
  }

  // Pass 2: classify. First matching rule wins, so each comment is counted once.
  const doomed: Candidate[] = [];
  for (const candidate of all) {
    const words = proseWords(candidate.body);
    if (!words.length) continue;

    const owned = new Set(identifierWords(candidate.owner));
    const qualified = words.some((word) => QUALIFIER_WORDS.has(word) && !owned.has(word));

    if (enabled.has('name') && !qualified) {
      const covered = words.filter((word) => owned.has(word)).length;
      if (covered / words.length >= nameRatio) {
        doomed.push({ ...candidate, rule: 'name' });
        continue;
      }
    }
    if (
      enabled.has('boilerplate') &&
      !qualified &&
      rawWordCount(candidate.body) <= BOILERPLATE_MAX_WORDS &&
      BOILERPLATE_PATTERNS.some((pattern) => pattern.test(candidate.body))
    ) {
      doomed.push({ ...candidate, rule: 'boilerplate' });
      continue;
    }
    if (
      enabled.has('near-empty') &&
      candidate.isMember &&
      rawWordCount(candidate.body) <= NEAR_EMPTY_MAX_WORDS &&
      typeIsNamed(candidate.typeText) &&
      !BANNER_PATTERN.test(candidate.body) &&
      !KEEPS_MEANING_PATTERN.test(candidate.body)
    ) {
      doomed.push({ ...candidate, rule: 'near-empty' });
      continue;
    }
    if (enabled.has('duplicate') && (filesPerBody.get(candidate.body)?.size ?? 0) >= dupThreshold) {
      doomed.push({ ...candidate, rule: 'duplicate' });
    }
  }

  const byFile = new Map<string, Candidate[]>();
  for (const candidate of doomed) {
    if (!byFile.has(candidate.file)) byFile.set(candidate.file, []);
    byFile.get(candidate.file)?.push(candidate);
  }

  if (mode === 'rewrite') {
    for (const [file, ranges] of byFile) {
      const source = sources.get(file);
      if (source) writeFileSync(file, removeRanges(source, ranges));
    }
  }

  const counts = { name: 0, boilerplate: 0, 'near-empty': 0, duplicate: 0 };
  for (const candidate of doomed) counts[candidate.rule] += 1;
  const verb = mode === 'rewrite' ? 'Removed' : 'Would remove';
  console.info(`${verb} ${doomed.length} comment(s) in ${byFile.size} file(s), of ${files.length} scanned.`);
  console.info(`  name-restating  ${counts.name}`);
  console.info(`  boilerplate     ${counts.boilerplate}`);
  console.info(`  near-empty      ${counts['near-empty']}`);
  console.info(`  duplicate       ${counts.duplicate}`);

  if (verbose) {
    for (const candidate of doomed.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.info(`  ${candidate.file}:${candidate.line} [${candidate.rule}/${candidate.owner}] ${candidate.body.slice(0, 100)}`);
    }
  }
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then `pnpm lint:fix` and `pnpm check`.');
}

main();
