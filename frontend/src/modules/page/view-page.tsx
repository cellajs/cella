import { MDXProvider } from '@mdx-js/react';
import { notFound } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { spyPrefix } from '~/hooks/scroll-spy-store';
import { RegisterSpySections } from '~/hooks/use-scroll-spy';
import { Spinner } from '~/modules/common/spinner';
import { DocsTileCard } from '~/modules/docs/docs-landing-page';
import { getDocPageComponent, pageSectionId, useChildDocPages, useDocPage } from '~/modules/page/content';
import { mdxComponents } from '~/modules/page/mdx-components';
import { TocAside } from '~/modules/page/toc-aside';
import { dateShort } from '~/utils/date-short';

interface ViewPageProps {
  slug: string;
}

/** Render modes: `default` full content, `overview` intro plus child page list, `nodeOnly` child navigation only. */
export function ViewPage({ slug }: ViewPageProps) {
  const page = useDocPage(slug);
  const Content = getDocPageComponent(slug);

  if (!page || !Content) throw notFound();

  // The aside lists h2 only; deeper levels stay reachable through anchors.
  const tocHeadings = page.headings.filter((heading) => heading.depth === 2);
  // The page section comes first, so the intro above the first heading counts as the page itself
  const spyIds = [pageSectionId, ...tocHeadings.map((heading) => heading.id)];
  const renderMode = page.renderMode;
  const showToc = renderMode !== 'nodeOnly' && tocHeadings.length >= 2;

  return (
    <div className="container">
      <div className="mx-auto flex max-w-4xl justify-center gap-10 lg:max-w-292">
        <div className="min-w-0 max-w-208 flex-1">
          <div id={`${spyPrefix}${pageSectionId}`} className="prose dark:prose-invert max-w-none">
            <h1 className="pt-6">{page.name}</h1>
            {page.updatedAt && <PageUpdatedAt updatedAt={page.updatedAt} />}

            {renderMode !== 'nodeOnly' && (
              <Suspense fallback={<Spinner className="my-16" />}>
                <MDXProvider components={mdxComponents}>
                  <Content />
                </MDXProvider>
                <RegisterSpySections ids={spyIds} />
              </Suspense>
            )}
            {renderMode !== 'default' && <ChildPagesList parentSlug={slug} />}
          </div>
        </div>

        <aside className="w-52 shrink-0 max-lg:hidden print:hidden">
          {showToc && (
            <div className="sticky top-3 z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto pt-8">
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
    <p className="text-muted-foreground text-sm">
      {t('c:last_edited')} {dateShort(updatedAt)}
    </p>
  );
}

function ChildPagesList({ parentSlug }: { parentSlug: string }) {
  const { t } = useTranslation();
  const childPages = useChildDocPages(parentSlug);

  if (childPages.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('c:no_child_pages')}</p>;
  }

  return (
    <div className="not-prose mt-6 grid gap-3">
      {childPages.map((page) => (
        <DocsTileCard key={page.id} tile={{ label: page.name, description: page.description, to: `/docs/page/${page.id}` }} />
      ))}
    </div>
  );
}
