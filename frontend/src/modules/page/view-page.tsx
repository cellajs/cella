import { MDXProvider } from '@mdx-js/react';
import { Link, notFound } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { type ComponentType, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { Spinner } from '~/modules/common/spinner';
import {
  type DocPage,
  getChildDocPages,
  getDocPage,
  getDocPageLoader,
  getResolvedDocPageComponent,
} from '~/modules/page/content';
import { mdxComponents } from '~/modules/page/mdx-components';
import { TocAside } from '~/modules/page/toc-aside';
import { dateShort } from '~/utils/date-short';

interface ViewPageProps {
  slug: string;
}

/**
 * Registers the page's headings with the scroll spy. Mounts inside the Suspense boundary after the
 * content, so the lazy body is in the DOM first: registerSections only observes elements that exist
 * at call time, and its initial-hash scroll needs the targets present.
 */
function RegisterSpySections({ ids }: { ids: string[] }) {
  useScrollSpy(ids);
  return null;
}

/**
 * Displays a docs page (frontmatter title + compiled MDX). Render modes: `default` (full content),
 * `overview` (intro + auto-generated child page list), `nodeOnly` (child navigation only).
 */
function ViewPage({ slug }: ViewPageProps) {
  const page = getDocPage(slug);

  // Code-split MDX body for this slug. On the docs route the route loader (page.$.tsx) already
  // resolved it, so it renders synchronously — no Suspense fallback; the lazy path covers callers
  // without that loader. The component is keyed by slug at the call site, so this memo is per-page.
  const Content = useMemo<ComponentType<{ components?: typeof mdxComponents }> | null>(() => {
    const resolved = getResolvedDocPageComponent(slug);
    if (resolved) return resolved;
    const loader = getDocPageLoader(slug);
    return loader ? lazy(async () => ({ default: await loader() })) : null;
  }, [slug]);

  // "On this page" nav: h2 only. Deeper levels stay reachable via anchors but
  // would make the aside noisy. Stable array identity for the spy registration effect.
  const tocHeadings = useMemo(() => (page?.headings ?? []).filter((h) => h.depth === 2), [page]);
  const tocIds = useMemo(() => tocHeadings.map((h) => h.id), [tocHeadings]);

  if (!page || !Content) throw notFound();

  const renderMode = page.renderMode;
  const showToc = renderMode !== 'nodeOnly' && tocHeadings.length >= 2;

  return (
    <div className="container">
      <div className="mx-auto flex max-w-4xl justify-center gap-10 lg:max-w-292">
        <div className="min-w-0 max-w-208 flex-1">
          <div className="prose dark:prose-invert max-w-none **:[[id^=spy-]]:scroll-mt-4">
            <h1 className="pt-6">{page.name}</h1>
            {page.updatedAt && <PageUpdatedAt updatedAt={page.updatedAt} />}

            {/* Default mode: render full content */}
            {renderMode === 'default' && (
              <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" />}>
                <MDXProvider components={mdxComponents}>
                  <Content />
                </MDXProvider>
                <RegisterSpySections key={slug} ids={tocIds} />
              </Suspense>
            )}

            {/* Overview mode: intro content + child page cards */}
            {renderMode === 'overview' && (
              <>
                <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" />}>
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

        <aside className="w-52 shrink-0 max-lg:hidden">
          {showToc && (
            <div className="group sticky top-3 z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto pt-8">
              <TocAside headings={tocHeadings} />
            </div>
          )}
        </aside>
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
      <ChevronRightIcon className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export { ViewPage };
