import { splitToken } from '../../../../shared/scripts/class-tokens.ts';
import { classStrings, declaredNames, fileScope, freshDesignSystem, printHeader } from './lib.mjs';

// Runs Tailwind's canonicalizer over every class string and splits the rewrites into proven equal and held for a person.
// `rem` stays unset: this app's root font size differs on phones, so a px value is no spacing step. Usage: node canon-check.mjs
const options = { collapse: true, logicalToPhysical: true };
const fontSize = /^text-(2xs|xs|sm|md|base|lg|xl|[2-9]xl)$/;
const sides = {
  inset: ['top', 'right', 'bottom', 'left'],
  'inset-inline': ['left', 'right'],
  'inset-block': ['top', 'bottom'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'padding-inline': ['padding-left', 'padding-right'],
  'padding-block': ['padding-top', 'padding-bottom'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'margin-inline': ['margin-left', 'margin-right'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'border-inline-width': ['border-left-width', 'border-right-width'],
  'border-block-width': ['border-top-width', 'border-bottom-width'],
};

printHeader();
const rewriter = await freshDesignSystem();
const verifier = await freshDesignSystem();
const { utilities } = declaredNames();
const scope = fileScope();

/** The declarations `tokens` leave in cascade order, longhand; null when a token compiles to nothing. */
function declarations(tokens) {
  const ordered = verifier.getClassOrder(tokens).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const merged = new Map();
  for (const [token] of ordered) {
    const css = verifier.candidatesToCss([token])[0];
    if (!css) return null;
    const body = css.replace(/@property[^{]*\{[^}]*\}/g, '');
    for (const [, property, value] of body.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
      for (const side of sides[property] ?? [property]) merged.set(side, value.replace(/\s+/g, ''));
    }
  }
  for (const carrier of ['--tw-leading', '--tw-font-weight']) merged.delete(carrier);
  return merged;
}

const sameDeclarations = (a, b) => a && b && a.size === b.size && [...a].every(([property, value]) => b.get(property) === value);
const prefix = (token) => splitToken(token).variants.join(':');

/** Why a rewrite goes to a person; empty when its declarations are proven equal. */
function holdReasons(tokens, removed, added) {
  const reasons = [];
  if (removed.length === added.length && removed.every((token, index) => splitToken(token).base === splitToken(added[index]).base)) {
    reasons.push('selector rewrite: compare cascade order and specificity');
  } else {
    for (const variant of new Set([...removed, ...added].map(prefix))) {
      const before = removed.filter((token) => prefix(token) === variant).map((token) => splitToken(token).base);
      const after = added.filter((token) => prefix(token) === variant).map((token) => splitToken(token).base);
      if (!before.length || !after.length) reasons.push(`selector rewrite at "${variant || 'base'}": compare cascade order and specificity`);
      else if (!sameDeclarations(declarations(before), declarations(after))) reasons.push(`value differs at "${variant || 'base'}"`);
    }
  }
  // `text-x/y` sets no --tw-leading, which a later size at another variant reads through `leading-*`.
  const collapsesLeading =
    removed.some((token) => splitToken(token).base.startsWith('leading-')) && added.some((token) => /^text-[^/]+\//.test(splitToken(token).base));
  const otherSizes = tokens.filter((token) => fontSize.test(splitToken(token).base) && !removed.includes(token));
  if (collapsesLeading && otherSizes.length) reasons.push(`--tw-leading carries to ${otherSizes.join(' ')}`);
  if (added.some((token) => utilities.has(splitToken(token).base))) reasons.push('collapsed into a declared utility: does its role fit?');
  return reasons;
}

const apply = [];
const hold = [];
const rows = classStrings({ stories: true }).filter(({ file }) => scope.get(file) !== 'identical');
for (const { file, line, tokens } of rows) {
  const canonical = rewriter.canonicalizeCandidates(tokens, options);
  const removed = tokens.filter((token) => !canonical.includes(token));
  const added = canonical.filter((token) => !tokens.includes(token));
  if (!removed.length) continue;
  const rewrite = { at: `${file}:${line}`, change: `${removed.join(' ')} => ${added.join(' ')}`, reasons: holdReasons(tokens, removed, added) };
  (rewrite.reasons.length ? hold : apply).push(rewrite);
}
console.info(`\nproven equal: ${apply.length}`);
for (const { at, change } of apply) console.info(`  ${at} ${change}`);
console.info(`\nheld for a person: ${hold.length}`);
for (const { at, change, reasons } of hold) console.info(`  ${at} ${change}\n    ${reasons.join('; ')}`);
console.info(`\nscanned: ${rows.length} class strings. Declarations cannot show an inline style that sets a theme-named variable: read the element.`);
