import { MDXProvider } from '@mdx-js/react';
import { Link, notFound } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { type ComponentType, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RegisterSpySections } from '~/hooks/use-scroll-spy';
import { Spinner } from '~/modules/common/spinner';
import type { DocPage } from '~/modules/page/content';
import { getChildDocPages, getDocPage, getDocPageLoader, getResolvedDocPageComponent, PAGE_SECTION_ID } from '~/modules/page/content';
import { mdxComponents } from '~/modules/page/mdx-components';
import { TocAside } from '~/modules/page/toc-aside';
import { dateShort } from '~/utils/date-short';

interface ViewPageProps {
  slug: string;
}

/** Render modes: `default` full content, `overview` intro plus child page list, `nodeOnly` child navigation only. */
function ViewPage({ slug }: ViewPageProps) {
  const page = getDocPage(slug);

  // The docs route loader (page.$.tsx) resolves the MDX body ahead of render; the lazy path covers callers without that loader.
  const Content = useMemo<ComponentType<{ components?: typeof mdxComponents }> | null>(() => {
    const resolved = getResolvedDocPageComponent(slug);
    if (resolved) return resolved;
    const loader = getDocPageLoader(slug);
    return loader ? lazy(async () => ({ default: await loader() })) : null;
  }, [slug]);

  // The aside lists h2 only; deeper levels stay reachable through anchors.
  const tocHeadings = useMemo(() => (page?.headings ?? []).filter((h) => h.depth === 2), [page]);
  // The page section comes first, so the intro above the first heading counts as the page itself
  const spyIds = useMemo(() => [PAGE_SECTION_ID, ...tocHeadings.map((h) => h.id)], [tocHeadings]);

  if (!page || !Content) throw notFound();

  const renderMode = page.renderMode;
  const showToc = renderMode !== 'nodeOnly' && tocHeadings.length >= 2;

  return (
    <div className="container">
      <div className="mx-auto flex max-w-4xl justify-center gap-10 lg:max-w-292">
        <div className="min-w-0 max-w-208 flex-1">
          <div id={`spy-${PAGE_SECTION_ID}`} className="prose dark:prose-invert max-w-none **:[[id^=spy-]]:scroll-mt-4">
            <h1 className="pt-6">{page.name}</h1>
            {page.updatedAt && <PageUpdatedAt updatedAt={page.updatedAt} />}

            {renderMode === 'default' && (
              <Suspense fallback={<Spinner className="my-16 size-6 opacity-50" />}>
                <MDXProvider components={mdxComponents}>
                  <Content />
                </MDXProvider>
                <RegisterSpySections key={slug} ids={spyIds} />
              </Suspense>
            )}

            {renderMode === 'overview' && (
              <>
                <Suspense fallback={<Spinner className="my-16 size-6 opacity-50" />}>
                  <MDXProvider components={mdxComponents}>
                    <Content />
                  </MDXProvider>
                  <RegisterSpySections key={slug} ids={spyIds} />
                </Suspense>
                <ChildPagesList parentSlug={slug} />
              </>
            )}

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

function ChildPageCard({ page }: { page: DocPage }) {
  return (
    <Link
      to="/docs/page/$"
      params={{ _splat: page.id }}
      className="group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <h3 className="link-decoration group-active:link-decoration-strong font-medium text-base group-hover:underline">{page.name}</h3>
        {page.description && <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{page.description}</p>}
      </div>
      <ChevronRightIcon className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export { ViewPage };
