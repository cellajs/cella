import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractHeadings, extractStructure, pageStructure } from './docs-frontmatter';

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
    expect(ids).toContain('spy-storybook');
    expect(ids).not.toContain('spy-testing-guide'); // leading h1 stripped
    // Fenced blocks in the doc contain `# comment` lines; none may leak as headings.
    expect(headings.every((h) => h.depth <= 3)).toBe(true);
  });
});

/**
 * Sections drive the docs search corpus: every paragraph must anchor to the id
 * of its nearest heading (bar the `spy-` prefix handling done at emit time),
 * and stripped-away markup must never leak into the searchable text.
 */
describe('extractStructure sections', () => {
  it('anchors paragraphs to their nearest heading; intro text gets null', () => {
    const src = 'Intro paragraph.\n\n## First\n\nUnder first.\n\nAlso under first.\n\n## Second\n\nUnder second.\n';
    expect(extractStructure(src).sections).toEqual([
      { headingId: null, text: 'Intro paragraph.' },
      { headingId: 'spy-first', text: 'Under first.' },
      { headingId: 'spy-first', text: 'Also under first.' },
      { headingId: 'spy-second', text: 'Under second.' },
    ]);
  });

  it('keeps section anchors aligned with deduped heading ids', () => {
    const src = '## Setup\n\nfirst setup\n\n## Setup\n\nsecond setup\n';
    const { headings, sections } = extractStructure(src);
    expect(headings.map((h) => h.id)).toEqual(['spy-setup', 'spy-setup-1']);
    expect(sections).toEqual([
      { headingId: 'spy-setup', text: 'first setup' },
      { headingId: 'spy-setup-1', text: 'second setup' },
    ]);
  });

  it('excludes frontmatter and fenced code from section text', () => {
    const src = ['---', 'title: Page', '---', '', '## Real', '', 'kept', '', '```bash', 'dropped', '```'].join('\n');
    expect(extractStructure(src).sections).toEqual([{ headingId: 'spy-real', text: 'kept' }]);
  });

  it('strips mdx imports, jsx tags, comments and markdown syntax to plain text', () => {
    const src = [
      "import Content from '../../cella/TESTING.md'",
      '',
      '## Section',
      '',
      '<Tiles a="b" />',
      '',
      '<!-- note to self -->',
      '',
      '> A **bold** [link](https://example.com) with `code`.',
      '',
      '- item one',
      '- item two',
      '',
      '| cell a | cell b |',
      '| --- | --- |',
      '| cell c | cell d |',
    ].join('\n');
    const texts = extractStructure(src).sections.map((s) => s.text);
    expect(texts).toContain('A bold link with code.');
    expect(texts).toContain('item one');
    expect(texts).toContain('item two');
    expect(texts.join(' ')).toContain('cell a cell b');
    expect(texts.join(' ')).not.toMatch(/import|Tiles|note to self|\||\*\*/);
  });

  it('splits uninterrupted lists into one section per item, keeping wrapped lines attached', () => {
    const src = [
      '## Components',
      '',
      '- **First:** alpha bravo',
      '  wrapped continuation line',
      '- **Second:** charlie with `singleVm` on',
      '1. numbered delta',
      '2. numbered echo',
    ].join('\n');
    expect(extractStructure(src).sections).toEqual([
      { headingId: 'spy-components', text: 'First: alpha bravo wrapped continuation line' },
      { headingId: 'spy-components', text: 'Second: charlie with singleVm on' },
      { headingId: 'spy-components', text: 'numbered delta' },
      { headingId: 'spy-components', text: 'numbered echo' },
    ]);
  });

  it('skips the leading h1 of repo docs but keeps its text under null anchor', () => {
    const src = '# Repo Doc\n\nrepo intro\n\n## Section\n\nbody\n';
    expect(extractStructure(src, { stripLeadingH1: true }).sections).toEqual([
      { headingId: null, text: 'repo intro' },
      { headingId: 'spy-section', text: 'body' },
    ]);
  });

  it('caps paragraph length', () => {
    const src = `## Big\n\n${'word '.repeat(300)}\n`;
    const [section] = extractStructure(src).sections;
    expect(section.text.length).toBeLessThanOrEqual(500);
  });

  it('follows wrapper-page imports for sections (real repo doc)', () => {
    const wrapperPath = path.resolve(__dirname, '../src/content/docs/fixture.mdx');
    const wrapperSource = "import Content from '../../../../cella/TESTING.md'\n\n<Content />\n";
    const { headings, sections } = pageStructure(wrapperPath, wrapperSource);
    expect(headings.length).toBeGreaterThan(0);
    expect(sections.length).toBeGreaterThan(0);
    // Every non-null section anchor must be an actual heading id of the page.
    const headingIds = new Set(headings.map((h) => h.id));
    expect(sections.every((s) => s.headingId === null || headingIds.has(s.headingId))).toBe(true);
  });
});
