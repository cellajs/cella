import ts from 'typescript';
import { type Finding, lineColumn } from './repo-files.ts';
import { parseSource } from './source-comments.ts';

/** Backend sources outside the two helpers, tests and mock builders. */
function isStampedSource(file: string): boolean {
  return (
    /^backend\/src\/.*\.ts$/.test(file) &&
    !/(?:\.test|-mocks)\.ts$|\/mocks\//.test(file) &&
    !file.endsWith('/utils/iso-date.ts') &&
    !file.endsWith('/db/utils/stamps.ts')
  );
}

const stampPairs = [
  ['updatedAt', 'updatedBy'],
  ['deletedAt', 'deletedBy'],
] as const;

/** A moment written by hand: the clock (`getIsoDate()`, `new Date`, sql`now()`) or a local holding one. */
function isMoment(value: ts.Expression): boolean {
  if (ts.isIdentifier(value)) return value.text !== 'undefined';
  if (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === 'getIsoDate') return true;
  if (ts.isTaggedTemplateExpression(value)) return value.tag.getText() === 'sql' && value.template.getText() === '`now()`';
  let root: ts.Expression = value;
  while (ts.isCallExpression(root) || ts.isPropertyAccessExpression(root)) root = root.expression;
  return ts.isNewExpression(root) && root.expression.getText() === 'Date';
}

/**
 * The pair in one object literal, in any order, shorthand included, with a moment for its time: a lone `updatedBy` in
 * an option bag, a column definition and a schema mask are no writes.
 */
function stampPairFindings(file: string, source: string): Finding[] {
  if (!/\b(?:updated|deleted)By\b/.test(source)) return [];
  const sourceFile = parseSource(file, source);
  const findings: Finding[] = [];
  sourceFile.forEachChild(function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const values = new Map<string, ts.Expression>();
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property)) values.set(property.name.text, property.name);
        else if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
          values.set(property.name.text, property.initializer);
        }
      }
      for (const [at, by] of stampPairs) {
        const moment = values.get(at);
        if (!moment || !values.has(by) || !isMoment(moment)) continue;
        findings.push({
          file,
          ...lineColumn(source, moment.parent.getStart(sourceFile)),
          rule: 'stamp-pair',
          term: `${at}, ${by}`,
          message: 'spread updateStamps(actorId) or deleteStamps(actorId) instead of writing the pair by hand',
        });
      }
    }
    node.forEachChild(visit);
  });
  return findings;
}

/** Stamp findings in one backend file: the clock read by hand, and a writer pair written by hand. */
export function stampFindings(file: string, source: string): Finding[] {
  if (!isStampedSource(file)) return [];
  const clock = [...source.matchAll(/new Date\(\)\.toISOString\(\)/g)].map((match) => ({
    file,
    ...lineColumn(source, match.index),
    rule: 'stamp-clock',
    term: match[0],
    message: 'use getIsoDate() for the current moment',
  }));
  return [...clock, ...stampPairFindings(file, source)];
}
