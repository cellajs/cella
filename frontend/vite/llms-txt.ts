import path from 'node:path';
import { type RepoLinkOptions, relativeRepoLink } from './remark-link-repo-paths.ts';

export interface LlmsOptions extends RepoLinkOptions {
  /** The H1: the app name. */
  name: string;
  /** The summary blockquote under the H1. */
  description: string;
  /** Origin every link points at, e.g. `https://cellajs.com`. */
  siteUrl: string;
}

/** A docs page as read from the content folder. */
export interface LlmsPage {
  /** Path under the content root, e.g. `sync-engine/client.mdx`. */
  relative: string;
  frontmatter: unknown;
  /** The page's own body: no frontmatter, MDX module lines or bare component tags. */
  body: string;
  /** The repo docs the page renders as its body. */
  imported: { file: string; source: string }[];
}

type PageMeta = { title?: string; description?: string; order?: number; hidden?: boolean; draft?: boolean };
type Entry = { slug: string; parent: string | null; meta: PageMeta & { title: string }; page: LlmsPage };

const RELATIVE_LINK = /\]\((\.{1,2}\/[^)\s]+)\)/g;
const PAGE_LINK = /\]\((\/docs\/page\/[^)#\s]+)(#[^)\s]*)?\)/g;

/**
 * `llms.txt` (https://llmstxt.org) and a Markdown copy of every docs page at `docs/page/<slug>.md`, keyed by file name.
 * The site renders its pages in the browser, so each link points at the page's Markdown copy. The sections follow the
 * sidebar: top-level pages under Docs, one section per page with children, hidden pages under Optional, drafts left out.
 */
export function llmsFiles(pages: LlmsPage[], options: LlmsOptions): Map<string, string> {
  const site = options.siteUrl.replace(/\/+$/, '');
  const markdownUrl = (route: string) => `${site}${route}.md`;

  // Same slugs as `pathToSlug` in modules/page/content.ts: `sync-engine/index.mdx` is `sync-engine`.
  const slugOf = (page: LlmsPage) => page.relative.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
  const slugs = new Set(pages.map(slugOf));
  const entries: Entry[] = [];
  for (const page of pages) {
    const slug = slugOf(page);
    const meta = (page.frontmatter ?? {}) as PageMeta;
    if (!slug || !meta.title || meta.draft) continue;
    const dir = slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/')) : null;
    entries.push({ slug, parent: dir && slugs.has(dir) ? dir : null, meta: { ...meta, title: meta.title }, page });
  }

  const files = new Map<string, string>();
  for (const { slug, meta, page } of entries) {
    // Repo docs link each other relatively: point those links at the Markdown copies, or at GitHub.
    const imported = page.imported.map(({ file, source }) =>
      source.replace(RELATIVE_LINK, (match, url: string) => {
        const link = relativeRepoLink(options, path.dirname(file), url, markdownUrl);
        return link ? `](${link})` : match;
      }),
    );
    // Content pages link other pages by route: point those at the Markdown copies too.
    const own = page.body.replace(PAGE_LINK, (_match, route: string, hash = '') => `](${markdownUrl(route)}${hash})`);
    const body = [own, ...imported]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n');
    files.set(`docs/page/${slug}.md`, `${body.startsWith('# ') ? body : `# ${meta.title}\n\n${body}`}\n`);
  }

  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const children = new Map<string | null, Entry[]>();
  for (const entry of entries) children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry]);
  for (const list of children.values()) list.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0) || a.meta.title.localeCompare(b.meta.title));

  const isHidden = (entry: Entry): boolean => !!entry.meta.hidden || (entry.parent ? isHidden(bySlug.get(entry.parent) as Entry) : false);
  const tree = (entry: Entry): Entry[] => [entry, ...(children.get(entry.slug) ?? []).flatMap(tree)];
  const line = ({ slug, meta }: Entry) => `- [${meta.title}](${markdownUrl(`/docs/page/${slug}`)})${meta.description ? `: ${meta.description}` : ''}`;
  const list = (heading: string, items: Entry[]) => (items.length ? [`## ${heading}`, ...items.map(line)].join('\n') : '');

  const top = (children.get(null) ?? []).filter((entry) => !isHidden(entry));
  const sections = [
    list(
      'Docs',
      top.filter((entry) => !children.has(entry.slug)),
    ),
    ...top
      .filter((entry) => children.has(entry.slug))
      .map((entry) =>
        list(
          entry.meta.title,
          tree(entry).filter((item) => !isHidden(item)),
        ),
      ),
    // sdk-static.ts serves the spec at this path.
    `## API\n- [OpenAPI](${site}/static/openapi.json): The REST API as an OpenAPI document.`,
    list('Optional', (children.get(null) ?? []).flatMap(tree).filter(isHidden)),
  ];
  files.set('llms.txt', `${[`# ${options.name}`, `> ${options.description}`, ...sections.filter(Boolean)].join('\n\n')}\n`);
  return files;
}
