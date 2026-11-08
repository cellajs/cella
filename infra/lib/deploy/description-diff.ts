import { isRecord } from '../utils/guards';
import { canonicalJson } from './applied-engine';

/** How many paths a list of changes names before it counts the rest. */
const NAMED_CHANGES = 8;

/**
 * What differs between two descriptions of the app: the dotted path of each leaf added, removed or changed, as `services.search added`,
 * `general.database.size changed` or `env.FOO removed`, in key order. Both are compared in their canonical form, so key order and layout
 * never count, and an array is one leaf, compared whole. Past eight paths the rest is counted: `+3 more`.
 */
export function describeChanges(before: unknown, after: unknown): string[] {
  const changes: string[] = [];
  const walk = (from: unknown, to: unknown, path: string): void => {
    if (!isRecord(from) || !isRecord(to)) {
      if (JSON.stringify(from) !== JSON.stringify(to)) changes.push(`${path || 'the description'} changed`);
      return;
    }
    for (const key of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
      const where = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(from, key)) changes.push(`${where} added`);
      else if (!Object.hasOwn(to, key)) changes.push(`${where} removed`);
      else walk(from[key], to[key], where);
    }
  };
  walk(JSON.parse(canonicalJson(before)), JSON.parse(canonicalJson(after)), '');
  return changes.length > NAMED_CHANGES ? [...changes.slice(0, NAMED_CHANGES), `+${changes.length - NAMED_CHANGES} more`] : changes;
}
