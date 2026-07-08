import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractHeadings } from './docs-frontmatter';

/**
 * The extracted heading ids must match what rehype-slug (prefix: 'spy-') assigns when
 * the same markdown compiles (vite.config.ts): same slugger, same text content, same
 * leading-h1 rule for repo docs. These fixtures pin the text-content derivation.
 */
describe('extractHeadings', () => {
  it('slugs plain headings with depth', () => {
    const src = '# Title\n\n## Running tests\n\nbody\n\n### Running a subset\n';
    expect(extractHeadings(src)).toEqual([
      { id: 'spy-title', text: 'Title', depth: 1 },
      { id: 'spy-running-tests', text: 'Running tests', depth: 2 },
      { id: 'spy-running-a-subset', text: 'Running a subset', depth: 3 },
    ]);
  });

  it('strips the leading h1 of repo docs, but only the first heading', () => {
    const src = '# Repo Doc\n\n## Section\n\n# Another h1\n';
    expect(extractHeadings(src, { stripLeadingH1: true })).toEqual([
      { id: 'spy-section', text: 'Section', depth: 2 },
      { id: 'spy-another-h1', text: 'Another h1', depth: 1 },
    ]);
  });

  it('ignores frontmatter and fenced code blocks', () => {
    const src = [
      '---',
      'title: Page',
      '---',
      '',
      '## Real',
      '',
      '```bash',
      '# not a heading',
      '```',
      '',
      '~~~',
      '## also not',
      '~~~',
      '',
      '## After',
    ].join('\n');
    expect(extractHeadings(src).map((h) => h.id)).toEqual(['spy-real', 'spy-after']);
  });

  it('derives text content like the compiled markdown: code, links, emphasis', () => {
    const src = [
      '## The `spy-` prefix',
      '## See [rehype-slug](https://example.com) docs',
      '## **Bold** and *italic* words',
      '## Café & crème: 100% "quoted"',
    ].join('\n\n');
    expect(extractHeadings(src)).toEqual([
      { id: 'spy-the-spy--prefix', text: 'The spy- prefix', depth: 2 },
      { id: 'spy-see-rehype-slug-docs', text: 'See rehype-slug docs', depth: 2 },
      { id: 'spy-bold-and-italic-words', text: 'Bold and italic words', depth: 2 },
      { id: 'spy-café--crème-100-quoted', text: 'Café & crème: 100% "quoted"', depth: 2 },
    ]);
  });

  it('dedupes duplicate headings like github-slugger (-1 suffixes)', () => {
    const src = '## Setup\n\n## Setup\n\n## Setup\n';
    expect(extractHeadings(src).map((h) => h.id)).toEqual(['spy-setup', 'spy-setup-1', 'spy-setup-2']);
  });

  it('extracts from a real repo doc (wrapper page body)', () => {
    const source = readFileSync(path.resolve(__dirname, '../../cella/TESTING.md'), 'utf8');
    const headings = extractHeadings(source, { stripLeadingH1: true });
    const ids = headings.map((h) => h.id);
    expect(ids).toContain('spy-running-tests');
    expect(ids).toContain('spy-storybook-component-tests');
    expect(ids).not.toContain('spy-testing-guide'); // leading h1 stripped
    // Fenced blocks in the doc contain `# comment` lines; none may leak as headings.
    expect(headings.every((h) => h.depth <= 3)).toBe(true);
  });
});
