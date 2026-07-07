import { MDXProvider } from '@mdx-js/react';
import { Link, notFound } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { type ComponentProps, type ComponentType, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { Spinner } from '~/modules/common/spinner';
import { getHashUrl } from '~/modules/docs/hash-url';
import { CodeBlock } from '~/modules/page/code-block';
import { type DocPage, getChildDocPages, getDocPage, getDocPageLoader } from '~/modules/page/content';
import { TocAside } from '~/modules/page/toc-aside';
import { dateShort } from '~/utils/date-short';

interface ViewPageProps {
  slug: string;
}

/**
 * Internal /docs links in content navigate via the router; in-page #anchor links scroll
 * via the spy store (which also queues until lazy content is laid out); external links
 * open in a new tab.
 */
function MdxLink({ href = '', children, ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} {...props}>
        {children}
      </Link>
    );
  }
  if (href.startsWith('#')) {
    return (
      <a
        href={href}
        {...props}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          scrollToSectionById(decodeURIComponent(href.slice(1)));
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

/**
 * Registers the page's headings with the scroll spy. Rendered inside the Suspense
 * boundary AFTER the content so it mounts only once the lazy body is in the DOM —
 * registerSections only observes elements that exist at call time, and its
 * initial-hash scroll needs the targets present.
 */
function RegisterSpySections({ ids }: { ids: string[] }) {
  useScrollSpy(ids);
  return null;
}

/**
 * Section heading (h2) with a hover copy-link button. The copied URL carries the bare
 * hash slug (spy store convention) — the DOM id keeps its `spy-` prefix. Deeper
 * headings keep their anchor ids but render plain (the button sits awkwardly at h3 size).
 */
function MdxHeading({ id = '', children, ...props }: ComponentProps<'h2'>) {
  const hash = id.replace(/^spy-/, '');
  return (
    <h2 id={id} className="group" {...props}>
      {children}
      {hash && <HashUrlButton url={getHashUrl(hash)} />}
    </h2>
  );
}

const mdxComponents = {
  a: MdxLink,
  h2: MdxHeading,
  pre: CodeBlock,
};

/**
 * Displays a docs page: frontmatter title + compiled MDX body.
 * Supports three render modes:
 * - default: renders full page content
 * - overview: renders intro content + auto-generated child page list
 * - nodeOnly: redirect-like experience showing child page navigation only
 */
function ViewPage({ slug }: ViewPageProps) {
  const page = getDocPage(slug);

  // Lazy-load the code-split MDX body for this slug. The component is keyed by
  // slug at the call site, so this memo lives for exactly one page.
  const Content = useMemo<ComponentType<{ components?: typeof mdxComponents }> | null>(() => {
    const loader = getDocPageLoader(slug);
    return loader ? lazy(async () => ({ default: await loader() })) : null;
  }, [slug]);

  // "On this page" nav: h2 only — deeper levels stay reachable via anchors but
  // would make the aside noisy. Stable array identity for the spy registration effect.
  const tocHeadings = useMemo(() => (page?.headings ?? []).filter((h) => h.depth === 2), [page]);
  const tocIds = useMemo(() => tocHeadings.map((h) => h.id), [tocHeadings]);

  if (!page || !Content) throw notFound();

  const renderMode = page.renderMode;
  const showToc = renderMode !== 'nodeOnly' && tocHeadings.length >= 2;

  return (
    <div className="container">
      <div className="mx-auto flex max-w-4xl justify-center gap-10 lg:max-w-292">
        <div className="min-w-0 max-w-[52rem] flex-1">
          <div className="prose dark:prose-invert max-w-none">
            <h1 className="pt-6">{page.name}</h1>
            {page.updatedAt && <PageUpdatedAt updatedAt={page.updatedAt} />}

            {/* Default mode: render full content */}
            {renderMode === 'default' && (
              <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
                <MDXProvider components={mdxComponents}>
                  <Content />
                </MDXProvider>
                <RegisterSpySections key={slug} ids={tocIds} />
              </Suspense>
            )}

            {/* Overview mode: intro content + child page cards */}
            {renderMode === 'overview' && (
              <>
                <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
                  <MDXProvider components={mdxComponents}>
                    <Content />
                  </MDXProvider>
                  <RegisterSpySections key={slug} ids={tocIds} />
                </Suspense>
                <ChildPagesList parentSlug={slug} />
              </>
            )}

            {/* Node-only mode: just navigation to children, no content */}
            {renderMode === 'nodeOnly' && <ChildPagesList parentSlug={slug} />}
          </div>
        </div>

        {/* Affixed "On this page" aside (same sticky wrapper as settings/legal asides) */}
        {showToc && (
          <aside className="w-52 shrink-0 max-lg:hidden">
            <div className="group sticky top-3 z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto pt-8">
              <TocAside headings={tocHeadings} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function PageUpdatedAt({ updatedAt }: { updatedAt: string }) {
  const { t } = useTranslation();
  return (
    <p className="text-muted-foreground text-sm lowercase">
      {t('c:last_edited')} {dateShort(updatedAt)}
    </p>
  );
}

/** Auto-generated list of child pages with descriptions. */
function ChildPagesList({ parentSlug }: { parentSlug: string }) {
  const { t } = useTranslation();
  const children = getChildDocPages(parentSlug);

  if (children.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('c:no_child_pages')}</p>;
  }

  return (
    <div className="not-prose mt-6 grid gap-3">
      {children.map((child) => (
        <ChildPageCard key={child.id} page={child} />
      ))}
    </div>
  );
}

/** Card for a child page in overview/nodeOnly mode. */
function ChildPageCard({ page }: { page: DocPage }) {
  return (
    <Link
      to="/docs/page/$"
      params={{ _splat: page.id }}
      className="group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-base underline-offset-2 group-hover:underline">{page.name}</h3>
        {page.description && <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{page.description}</p>}
      </div>
      <ChevronRightIcon
        size={16}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

export { ViewPage };
