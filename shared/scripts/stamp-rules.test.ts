import { describe, expect, it } from 'vitest';
import { stampFindings } from './stamp-rules.ts';

const file = 'backend/src/modules/example/operations/update-example.ts';
const rules = (source: string, path = file) => stampFindings(path, source).map(({ rule, line, column }) => `${rule} ${line}:${column}`);

describe('stampFindings', () => {
  it('finds a hand-written pair in any order, apart, in shorthand or with any writer value', () => {
    const source = [
      "db.update(t).set({ updatedAt: getIsoDate(), status: 'done', updatedBy: actorId });",
      'const updatedAt = getIsoDate(); db.update(t).set({ updatedAt, updatedBy });',
      'db.update(t).set({ deletedBy: ctx.var.user?.id ?? null, deletedAt: new Date().toISOString() });',
    ].join('\n');
    expect(rules(source)).toEqual(['stamp-clock 3:68', 'stamp-pair 1:20', 'stamp-pair 2:52', 'stamp-pair 3:57']);
  });

  it('leaves column definitions, schema masks, read values, the stamp helpers and mock builders alone', () => {
    const source = [
      'const columns = { updatedAt: isoTimestamp(), updatedBy: actorColumn() };',
      'const schema = base.omit({ updatedAt: true, updatedBy: true });',
      'const row = { updatedAt: other.updatedAt, updatedBy: other.updatedBy };',
      'db.update(t).set({ ...updateStamps(actorId), status });',
    ].join('\n');
    expect(rules(source)).toEqual([]);
    const mock = 'const row = { updatedAt: createdAt, updatedBy: actorId };';
    expect(rules(mock, 'backend/src/modules/example/example-mocks.ts')).toEqual([]);
    expect(rules(mock, 'backend/src/mocks/mock-entity-columns.ts')).toEqual([]);
  });
});
