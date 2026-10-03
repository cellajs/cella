import { describe, expect, it } from 'vitest';
import { frontendFindings } from './check-frontend-style.ts';

const file = 'frontend/src/modules/example/use-example.ts';
const rules = (source: string) => frontendFindings(file, source, new Set()).map(({ rule, message }) => `${rule}: ${message}`);

describe('memo-dependency-unread', () => {
  it('reports a dependency the callback never reads', () => {
    const source = 'const menu = useMemo(() => buildMenu(userId), [userId, recomputeKey]);';
    expect(rules(source)).toEqual([expect.stringMatching(/^memo-dependency-unread: recomputeKey is a dependency the callback never reads/)]);
  });

  it('accepts dependencies read through a property, a call or a nested function', () => {
    const source = [
      'const a = useMemo(() => items.filter((item) => item.id === selected.id), [items, selected.id]);',
      'const b = useCallback(() => store.getState().close(id), [store, id]);',
    ].join('\n');
    expect(rules(source)).toEqual([]);
  });

  it('leaves a callback passed by name alone', () => {
    expect(rules('const run = useCallback(handler, [handler, version]);')).toEqual([]);
  });
});
