import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { splitToken } from '../../../../shared/scripts/class-tokens.ts';
import { repoFiles } from '../../../../shared/scripts/repo-files.ts';
import { classSources, classStrings, declaredNames, fileScope, freshDesignSystem, printHeader, repoRoot } from './lib.mjs';

// Lists state variants that compile and that nothing can satisfy, as leads for the state pass in passes.md: `pnpm style` passes
// them all. Emitters come from the whole frontend without stories, consumers from the files in scope. Usage: node state-check.mjs

const read = (file) => readFileSync(join(repoRoot, file), 'utf8');
const emitterFiles = [...classSources(), ...repoFiles().filter((file) => file === 'frontend/index.html')];
const emitterTexts = emitterFiles.map(read);
const cssText = repoFiles()
  .filter((file) => /^frontend\/src\/.*\.css$/.test(file))
  .map(read)
  .join('\n');

/** Attributes a runtime dependency's code names, each with the packages naming it; a named attribute may sit on another element. */
function libraryAttributes() {
  const { dependencies } = JSON.parse(read('frontend/package.json'));
  const found = new Map();
  for (const name of Object.keys(dependencies)) {
    let output = '';
    try {
      const dir = realpathSync(join(repoRoot, 'frontend/node_modules', name));
      output = execFileSync('grep', ['-rhoE', 'data-[a-z][a-z0-9-]+', '--include=*.js', '--include=*.mjs', '--include=*.cjs', dir], {
        encoding: 'utf8',
        maxBuffer: 1e9,
      });
    } catch {
      // grep exits 1 on no match; a workspace or missing package names nothing.
    }
    for (const attribute of new Set(output.split('\n').filter(Boolean))) found.set(attribute, [...(found.get(attribute) ?? []), name]);
  }
  return found;
}

const emittedByApp = (attribute) => {
  const camel = attribute.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  const pattern = new RegExp(`(?<![\\w:\\[-])${attribute}(?![\\w:-])|dataset\\.${camel}\\b`);
  return emitterTexts.some((text) => pattern.test(text));
};

const markers = new Set();
const markerFiles = new Map();
emitterTexts.forEach((text, index) => {
  for (const match of text.matchAll(/(?<![\w:-])(group|peer)\/([\w-]+)/g)) {
    const marker = `${match[1]}/${match[2]}`;
    markers.add(marker);
    markerFiles.set(marker, [...(markerFiles.get(marker) ?? []), emitterFiles[index]]);
  }
});

const ds = await freshDesignSystem();
const { variants: customVariants } = declaredNames();
const libraries = libraryAttributes();
const compiles = new Map();
const isUtility = (name) => {
  if (!compiles.has(name)) compiles.set(name, ds.candidatesToCss([name])[0] !== null);
  return compiles.get(name);
};

/** The rules, each returning `{ rule, at, token, note }` leads for the given class strings. */
function findLeads(rows) {
  const leads = [];
  const add = (rule, row, token, note = '') => leads.push({ rule, at: `${row.file}:${row.line}`, token, note });
  const fileText = new Map();
  const hasMarker = (file, name) => {
    if (!fileText.has(file)) fileText.set(file, read(file));
    return new RegExp(`["'\`\\s]${name}["'\`\\s]`).test(fileText.get(file));
  };
  for (const row of rows) {
    for (const token of row.tokens) {
      for (const variant of splitToken(token).variants) {
        const bare = /^(?:not-|in-|group-|peer-|has-)*data-([a-z][a-z0-9-]*)(?:\/.*)?$/.exec(variant);
        const valued = variant.includes('[') ? [...variant.matchAll(/data-\[([a-z0-9-]+)(?:=([^\]]*))?\]/g)] : [];
        for (const [attribute, value] of [...(bare ? [[bare[1]]] : []), ...valued.map((match) => [match[1], match[2]])]) {
          const name = `data-${attribute}`;
          if (customVariants.has(name) || emittedByApp(name)) continue;
          const library = libraries.get(name);
          if (!library) add('no emitter', row, token);
          else if (value)
            add('value form, only a library names it', row, token, `does ${library.join(', ')} write ${name} with this value on this element?`);
        }
        const group = /^(?:not-|in-)*(group|peer)-.*\/([\w-]+)$/.exec(variant);
        if (group && !markers.has(`${group[1]}/${group[2]}`)) add('group or peer with no marker', row, token, `${group[1]}/${group[2]}`);
        const unnamed = /^(?:not-|in-)*(group|peer)-/.exec(variant);
        if (unnamed && !variant.includes('/') && !hasMarker(row.file, unnamed[1])) add('unnamed consumer, no marker in this file', row, token);
        if (/^(?:not-)?peer-(disabled|checked|invalid|required|focus)$/.test(variant))
          add('peer reads a native pseudo-class', row, token, 'a Base UI root is often a span, which never matches it');
        for (const match of variant.includes('[') ? variant.matchAll(/\.(-?[a-zA-Z][\w-]*)/g) : []) {
          if (match[1] !== 'sr-only' && isUtility(match[1])) add('utility used as a selector', row, token, match[1]);
        }
      }
    }
  }
  return leads;
}

printHeader();
const control = {
  file: classSources()[0],
  line: 0,
  tokens: ['data-zz-control:flex', 'data-[zz-control=true]:flex', 'group-hover/zz-control:flex', 'group-[.flex]/search:flex'],
};
const controlRules = new Set(findLeads([control]).map(({ rule }) => rule));
for (const rule of ['no emitter', 'group or peer with no marker', 'utility used as a selector']) {
  if (!controlRules.has(rule)) {
    console.error(`control failed: "${rule}" did not fire, so a zero below means nothing`);
    process.exit(1);
  }
}
console.info('control: ok');

const scope = fileScope();
const rows = classStrings().filter(({ file }) => scope.get(file) !== 'identical');
const allTokens = classStrings({ stories: true }).flatMap(({ tokens }) => tokens);
const consumed = new Set();
for (const token of allTokens) {
  for (const variant of splitToken(token).variants) {
    const group = /^(?:not-|in-)*(group|peer)-.*\/([\w-]+)$/.exec(variant);
    if (group) consumed.add(`${group[1]}/${group[2]}`);
  }
}
const byRule = new Map();
for (const lead of findLeads(rows)) byRule.set(lead.rule, [...(byRule.get(lead.rule) ?? []), lead]);
const inScope = (marker) => markerFiles.get(marker).some((file) => scope.get(file) !== 'identical');
const unusedMarkers = [...markers].filter((marker) => inScope(marker) && !consumed.has(marker) && !cssText.includes(marker.replace('/', '\\/')));
for (const [rule, leads] of byRule) {
  console.info(`\n${rule}: ${leads.length}`);
  // One line per note: a family such as `data-[swipe-direction=*]` asks one question.
  const byNote = Map.groupBy(leads, ({ note, token, at }) => note || `${at} ${token}`);
  for (const [key, group] of byNote) console.info(group[0].note ? `  ${group.length}x ${group[0].at} ${group[0].token}  (${key})` : `  ${key}`);
}
console.info(`\nmarker with no consumer: ${unusedMarkers.length}\n  ${unusedMarkers.join('\n  ')}`);
console.info(
  `\nscanned: ${rows.length} class strings; emitters from ${emitterTexts.length} files, ${libraries.size} library attributes. Every line is a lead: an app may emit a template hook.`,
);
