import { describe, expect, it } from 'vitest';
import { createEngine } from '~/modules/docs/search/engine';

const page = {
  slug: 'architecture',
  title: 'Architecture',
  breadcrumbs: [],
  headings: [],
  sections: [{ headingId: null, text: 'Every product table is scoped for multi-tenancy.' }],
};

describe('docs search engine', () => {
  it('finds a hyphenated word by any of its parts', async () => {
    const engine = createEngine([page], null);
    for (const term of ['multi', 'tenancy', 'multi-tenancy']) {
      const rows = await engine.search(term);
      expect(rows.map((row) => row.pageId)).toContain('architecture');
    }
  });
});
