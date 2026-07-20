import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { remarkLinkRepoPaths } from './remark-link-repo-paths';

const repoRoot = path.resolve(__dirname, '../..');
const repoUrl = 'https://github.com/cellajs/cella';
const transform = remarkLinkRepoPaths({ repoRoot, repoUrl });
const docsTransform = remarkLinkRepoPaths({
  repoRoot,
  repoUrl,
  docRoutes: {
    'cella/ARCHITECTURE.md': '/docs/page/architecture',
    'cella/CLIENT.md': '/docs/page/architecture/client',
    'cella/ADD_ENTITY.md': '/docs/page/guides/new-entity',
  },
});

type Node = { type: string; value?: string; url?: string; children?: Node[] };

/** Minimal mdast: a paragraph wrapping the given inline children. */
const para = (...children: Node[]): Node => ({ type: 'root', children: [{ type: 'paragraph', children }] });
const code = (value: string): Node => ({ type: 'inlineCode', value });
const firstInline = (tree: Node): Node => tree.children?.[0].children?.[0] as Node;

/** The (possibly rewritten) first inline node after running the plugin. */
function runOn(value: string): Node {
  const tree = para(code(value));
  transform(tree as never);
  return firstInline(tree);
}

describe('remarkLinkRepoPaths', () => {
  it('links inline code that resolves to a real repo file', () => {
    const node = runOn('frontend/vite.config.ts');
    expect(node.type).toBe('link');
    expect(node.url).toBe(`${repoUrl}/blob/main/frontend/vite.config.ts`);
    expect(node.children?.[0]).toEqual(code('frontend/vite.config.ts'));
  });

  it('maps a :line suffix to #L and a range to #L-L', () => {
    expect(runOn('frontend/vite.config.ts:12').url).toBe(`${repoUrl}/blob/main/frontend/vite.config.ts#L12`);
    expect(runOn('frontend/vite.config.ts:12-20').url).toBe(`${repoUrl}/blob/main/frontend/vite.config.ts#L12-L20`);
  });

  it('leaves paths that do not resolve to a file as plain code', () => {
    expect(runOn('backend/src/does-not-exist.ts').type).toBe('inlineCode');
    expect(runOn('index.ts').type).toBe('inlineCode'); // ambiguous bare name, no root file
  });

  it('links a trailing-slash directory reference to the tree URL', () => {
    const node = runOn('frontend/vite/');
    expect(node.type).toBe('link');
    expect(node.url).toBe(`${repoUrl}/tree/main/frontend/vite`);
  });

  it('leaves trailing-slash references that are not real directories as plain code', () => {
    expect(runOn('frontend/does-not-exist/').type).toBe('inlineCode');
    expect(runOn('frontend/vite.config.ts/').type).toBe('inlineCode'); // file, not a directory
    expect(runOn('../frontend/').type).toBe('inlineCode');
  });

  it('ignores inline code that is not a file path', () => {
    expect(runOn('pnpm test').type).toBe('inlineCode');
    expect(runOn('TEST_MODE').type).toBe('inlineCode');
    expect(runOn('--project=backend').type).toBe('inlineCode');
  });

  it('rejects traversal and absolute paths without touching the fs', () => {
    expect(runOn('../package.json').type).toBe('inlineCode');
    expect(runOn('/etc/passwd').type).toBe('inlineCode');
  });

  it('does not re-link code already inside a link', () => {
    const tree = para({ type: 'link', url: 'https://example.com', children: [code('frontend/vite.config.ts')] });
    transform(tree as never);
    const link = firstInline(tree);
    expect(link.url).toBe('https://example.com');
    expect(link.children?.[0].type).toBe('inlineCode');
  });
});

describe('relative markdown links in repo docs', () => {
  const repoDocFile = { path: path.join(repoRoot, 'cella', 'AGENTS.md') };
  const contentFile = { path: path.join(repoRoot, 'frontend', 'src', 'content', 'docs', 'quickstart.md') };
  const link = (url: string): Node => ({ type: 'link', url, children: [{ type: 'text', value: 'x' }] });

  /** The first inline link node after running the plugin with the given source file. */
  function runLink(url: string, file: { path?: string }, activeTransform = transform): Node {
    const tree = para(link(url));
    activeTransform(tree as never, file);
    return firstInline(tree);
  }

  it('rewrites relative links in repo docs to GitHub blob URLs', () => {
    expect(runLink('../shared/config/config.default.ts', repoDocFile).url).toBe(
      `${repoUrl}/blob/main/shared/config/config.default.ts`,
    );
    expect(runLink('./ARCHITECTURE.md', repoDocFile).url).toBe(`${repoUrl}/blob/main/cella/ARCHITECTURE.md`);
  });

  it('keeps the hash fragment', () => {
    expect(runLink('./ARCHITECTURE.md#anchor', repoDocFile).url).toBe(
      `${repoUrl}/blob/main/cella/ARCHITECTURE.md#anchor`,
    );
  });

  it('maps repository docs with first-class pages to internal docs routes', () => {
    expect(runLink('./ARCHITECTURE.md#entity-hierarchy-model', repoDocFile, docsTransform).url).toBe(
      '/docs/page/architecture#entity-hierarchy-model',
    );
    expect(runLink('./CLIENT.md', repoDocFile, docsTransform).url).toBe('/docs/page/architecture/client');
    expect(runLink('./ADD_ENTITY.md', repoDocFile, docsTransform).url).toBe('/docs/page/guides/new-entity');
  });

  it('keeps using GitHub for repository docs without a first-class page', () => {
    expect(runLink('./SECURITY.md', repoDocFile, docsTransform).url).toBe(`${repoUrl}/blob/main/cella/SECURITY.md`);
  });

  it('leaves unresolvable or out-of-repo relative links untouched', () => {
    expect(runLink('./does-not-exist.md', repoDocFile).url).toBe('./does-not-exist.md');
    expect(runLink('../../../../etc/passwd', repoDocFile).url).toBe('../../../../etc/passwd');
  });

  it('does not touch content-root pages or non-relative links', () => {
    expect(runLink('../guides', contentFile).url).toBe('../guides');
    expect(runLink('https://example.com', repoDocFile).url).toBe('https://example.com');
    expect(runLink('/docs/operations', repoDocFile).url).toBe('/docs/operations');
  });
});
