import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One leaf of `config.default.ts` the scaffolder's template sets differently: `value` is the TypeScript source of the
 * template's value, `replace` an edit of the line's own text, `remove` drops an optional leaf with its doc comment, and
 * `comment` the doc comment the template carries above the leaf in place of the default's. A `path` names the leaf by
 * its keys, so the entry survives a move within the file.
 */
interface TemplateLeaf {
  path: string;
  value?: string;
  replace?: [from: string, to: string];
  remove?: true;
  comment?: string;
}

/** The scaffolder's two tokens: the app's display name and its slug. */
const name = '__project_name__';
const slug = '__project_slug__';
const domain = `${slug}.example.com`;

/** What a new app's config has and the template's does not: identity, fresh-app starting values, and an empty worked example. */
export const templateLeaves: readonly TemplateLeaf[] = [
  { path: 'name', value: `'${name}'` },
  { path: 'slug', value: `'${slug}'` },
  { path: 'domain', value: `'${domain}'` },
  { path: 'description', value: `'${name}: powered by Cella.'` },
  { path: 'asciiArt', value: '[]' },
  { path: 'origin', value: `'https://www.${domain}'` },
  // Off until the app runs a relay of its own.
  { path: 'services.yjs', replace: ['enabled: true', 'enabled: false'] },
  { path: 'statusUrl', value: `'https://status.${domain}'` },
  { path: 'productionUrl', value: `'https://www.${domain}'` },
  { path: 'repositoryUrl', remove: true },
  { path: 'senderEmail', value: `'notifications@${domain}'` },
  { path: 'supportEmail', value: `'support@${domain}'` },
  { path: 'securityEmail', value: `'security@${domain}'` },
  { path: 'has.uploads', value: 'false', comment: 'Off until S3 is configured: files stay in the browser (IndexedDB).' },
  { path: 'cookieVersion', value: "'v1'" },
  { path: 'clientCacheVersion', value: "'v1'" },
  {
    path: 'enabledAuthStrategies',
    value: "['passkey', 'oauth', 'totp', 'magic'] as const",
    comment: 'No `sso` until the app declares a federation.',
  },
  {
    path: 'federations',
    value: '{} as Record<string, FederationConfig>',
    comment:
      "Identity federations institutions sign in through (`sso`). The key is the session strategy, the identities provider slug and the env prefix of the client secret (`SSO_<KEY>_CLIENT_ID` / `SSO_<KEY>_CLIENT_SECRET`); a federation is live when those are set. Every mode but production signs in through its `sandbox`. A tenant's connection names one entry and the institution behind it. A new app starts with none; the template's own config declares `surfconext` as a worked example.",
  },
  { path: 's3', value: "{ region: '', host: '' } as S3ConfigInput" },
  { path: 'gleapToken', value: "''" },
  {
    path: 'mapStyleUrls',
    value: "{ light: '', dark: '' }",
    comment:
      "MapLibre style URL per color mode for the contact map; empty hides the map. OpenFreeMap needs no key: light 'https://tiles.openfreemap.org/styles/positron', dark 'https://tiles.openfreemap.org/styles/dark'. The CSP allows each style's origin; tiles, fonts and icons must come from that same origin.",
  },
  {
    path: 'maplePublicIngestKey',
    value: "''",
    comment: 'Maple.dev public ingest key, safe to embed in the frontend bundle; empty turns frontend export off.',
  },
  { path: 'company', value: `{ name: '${name}', email: 'info@${domain}' }` },
];

const indentOf = (line: string) => line.length - line.trimStart().length;
const isCommentLine = (line: string) => /^\s*(\/\/|\/\*\*|\*)/.test(line);

/** The index of the line that declares `path` under the config literal, and of the last line of its value. */
function locate(lines: string[], path: string, file: string): { start: number; end: number } {
  let from = lines.findIndex((line) => line.startsWith('export const config = {'));
  if (from < 0) throw new Error(`${file}: no \`export const config = {\` literal.`);
  let to = lines.length;
  let depth = 1;
  let found = { start: -1, end: -1 };
  for (const key of path.split('.')) {
    const indent = ' '.repeat(depth * 2);
    const start = lines.findIndex((line, index) => index > from && index < to && line.startsWith(`${indent}${key}:`));
    if (start < 0) throw new Error(`${file}: no leaf \`${path}\` (at \`${key}\`).`);
    const opensBlock = /[{[]$/.test(lines[start]);
    // A block ends at the first line back on its own indent; a one-line value ends on its line.
    const end = opensBlock
      ? lines.findIndex((line, index) => index > start && indentOf(line) === indent.length && !isCommentLine(line) && /^\s*[}\]]/.test(line))
      : start;
    if (end < 0) throw new Error(`${file}: the block of \`${path}\` never closes.`);
    found = { start, end };
    from = start;
    to = end + 1;
    depth += 1;
  }
  return found;
}

/** The first line of the doc comment directly above `index`, or `index` when the leaf has none. */
function commentAbove(lines: string[], index: number): number {
  let start = index;
  while (start > 0 && isCommentLine(lines[start - 1])) start -= 1;
  return start;
}

/** The column the default config wraps its doc comments at. */
const commentWidth = 120;

/** A doc comment at `indent`, on one line when it fits, else wrapped word by word. */
function renderComment(text: string, indent: string): string[] {
  const oneLine = `${indent}/** ${text} */`;
  if (oneLine.length <= commentWidth) return [oneLine];
  const width = commentWidth - indent.length - 3;
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(' ')) {
    if (row && `${row} ${word}`.length > width) {
      rows.push(row);
      row = word;
    } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return [`${indent}/**`, ...rows.map((line) => `${indent} * ${line}`), `${indent} */`];
}

/** `source` with every leaf applied; `file` names the source in errors. Throws when a leaf or its anchor is gone. */
export function applyLeaves(source: string, leaves: readonly TemplateLeaf[], file: string): string {
  const lines = source.split('\n');
  for (const leaf of leaves) {
    const { start, end } = locate(lines, leaf.path, file);
    const indent = ' '.repeat(indentOf(lines[start]));
    const key = leaf.path.split('.').at(-1);
    if (leaf.remove) {
      const cut = commentAbove(lines, start);
      lines.splice(cut, end + 1 - cut);
      continue;
    }
    const replacement: string[] = [];
    if (leaf.value !== undefined) replacement.push(`${indent}${key}: ${leaf.value},`);
    else if (leaf.replace) {
      const [from, to] = leaf.replace;
      if (!lines[start].includes(from)) throw new Error(`${file}: \`${leaf.path}\` holds no \`${from}\`.`);
      replacement.push(lines[start].replace(from, to));
    } else replacement.push(...lines.slice(start, end + 1));
    const cut = leaf.comment === undefined ? start : commentAbove(lines, start);
    const above = leaf.comment === undefined ? [] : renderComment(leaf.comment, indent);
    lines.splice(cut, end + 1 - cut, ...above, ...replacement);
  }
  return lines.join('\n');
}

/** The scaffolder's template: `source`, the default config, with every template leaf applied. */
export function renderTemplateConfig(source: string): string {
  return applyLeaves(source, templateLeaves, 'config.default.ts');
}

/** What the app-shape suite run (check-config-shape.ts) edits in both config files: arranged surfaces, another feature flag. */
export const appShapeLeaves: readonly TemplateLeaf[] = [
  {
    path: 'surfaces',
    replace: [
      'surfaces: {} as',
      "surfaces: { 'organization.tabs': { order: ['members', 'settings'], hidden: ['attachments'] }, 'user.profile': { order: ['organizations'] } } as",
    ],
  },
  { path: 'has.commentEmails', replace: ['commentEmails: false', 'commentEmails: true'] },
];

/** Applied to `config.default.ts` only: the rendered template already drops `sso`. */
export const appShapeDefaultOnlyLeaves: readonly TemplateLeaf[] = [{ path: 'enabledAuthStrategies', replace: [", 'sso'", ''] }];

/** The one app-shape edit outside the config literal: a stricter member policy. */
export const appShapePermissionsEdit = {
  file: 'permissions-config.ts',
  from: "channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });",
  to: 'channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });',
} as const;

if (import.meta.main) {
  const configDir = join(import.meta.dirname, '..', 'config');
  const templatePath = join(configDir, 'config.template.ts');
  // An app has consumed its template; only the template repo keeps one current.
  if (existsSync(templatePath)) {
    const source = readFileSync(join(configDir, 'config.default.ts'), 'utf8');
    const rendered = renderTemplateConfig(source);
    if (readFileSync(templatePath, 'utf8') !== rendered) {
      writeFileSync(templatePath, rendered);
      console.info('Wrote shared/config/config.template.ts from config.default.ts.');
    }
    // Render the app shape in memory too, so a moved leaf or anchor fails the PR that moves it, not the release PR.
    applyLeaves(source, [...appShapeLeaves, ...appShapeDefaultOnlyLeaves], 'config.default.ts');
    applyLeaves(rendered, appShapeLeaves, 'config.template.ts');
    const permissions = readFileSync(join(configDir, appShapePermissionsEdit.file), 'utf8');
    if (!permissions.includes(appShapePermissionsEdit.from)) {
      throw new Error(`${appShapePermissionsEdit.file} no longer holds \`${appShapePermissionsEdit.from}\`: adjust write-template-config.ts.`);
    }
  }
}
