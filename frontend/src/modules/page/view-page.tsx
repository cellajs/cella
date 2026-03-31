import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRightIcon, EditIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { Page } from 'sdk';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { Spinner } from '~/modules/common/spinner';
import { StickyBox } from '~/modules/common/sticky-box';
import { pageQueryOptions, pagesListQueryOptions } from '~/modules/page/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';
import { dateShort } from '~/utils/date-short';

interface ViewPageProps {
  pageId: string;
}

/** Get published child pages sorted by displayOrder from the pages list cache. */
function useChildPages(parentId: string) {
  const { data } = useInfiniteQuery({
    ...pagesListQueryOptions({}),
    select: ({ pages }) =>
      pages
        .flatMap(({ items }) => items)
        .filter((p) => p.parentId === parentId && p.status === 'published')
        .sort((a, b) => a.displayOrder - b.displayOrder),
  });
  return data ?? [];
}

/**
 * Displays a page with its name as title and description as the main content.
 * Supports three render modes:
 * - default: renders full page content
 * - overview: renders intro content + auto-generated child page list
 * - nodeOnly: redirects-like experience showing child page navigation only
 */
function ViewPage({ pageId }: ViewPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSystemAdmin } = useUserStore();

  // Get page from React Query
  const { data: page } = useSuspenseQuery(pageQueryOptions(pageId));

  if (!page) {
    return (
      <div className="my-4 md:mt-8 mx-auto flex justify-center">
        <Spinner className="my-16 h-6 w-6" />
      </div>
    );
  }

  const renderMode = page.renderMode ?? 'default';

  return (
    <div className="container">
      <div className="mx-auto max-w-4xl">
        <StickyBox className="z-10 bg-background/60 backdrop-blur-xs" hideWhenOutOfView>
          <div className="flex items-center justify-between gap-3 py-3 sm:py-6">
            <div className="flex items-center gap-2">
              {isSystemAdmin && (
                <Button variant="plain" onClick={() => navigate({ to: '/docs/page/$id/edit', params: { id: pageId } })}>
                  <EditIcon size={16} className="mr-2" />
                  {t('common:edit')}
                </Button>
              )}
            </div>
            <div className="flex lowercase flex-col items-end gap-1 text-sm text-muted-foreground">
              <div>
                {page.status === 'published' ? t('common:published') : t('common:created')} {dateShort(page.createdAt)}
              </div>
              {page.status === 'published' && page.updatedAt && (
                <div className="opacity-50">
                  {t('common:last_edited')} {dateShort(page.updatedAt)}
                </div>
              )}
            </div>
          </div>
        </StickyBox>

        <div className="prose dark:prose-invert max-w-none">
          <h1 className="pt-2">{page.name}</h1>

          {/* Default mode: render full content */}
          {renderMode === 'default' && page.description && (
            <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
              <BlockNoteFullHtml
                id={`page-${pageId}`}
                defaultValue={page.description}
                className="text-muted-foreground font-light"
                clickOpensPreview
                publicFiles
              />
            </Suspense>
          )}

          {/* Overview mode: optional intro content + child page cards */}
          {renderMode === 'overview' && (
            <>
              {page.description && (
                <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
                  <BlockNoteFullHtml
                    id={`page-${pageId}`}
                    defaultValue={page.description}
                    className="text-muted-foreground font-light"
                    clickOpensPreview
                    publicFiles
                  />
                </Suspense>
              )}
              <ChildPagesList parentId={pageId} />
            </>
          )}

          {/* Node-only mode: just navigation to children, no content */}
          {renderMode === 'nodeOnly' && <ChildPagesList parentId={pageId} />}
        </div>
      </div>
    </div>
  );
}

/** Auto-generated list of published child pages with descriptions. */
function ChildPagesList({ parentId }: { parentId: string }) {
  const { t } = useTranslation();
  const children = useChildPages(parentId);

  if (children.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('common:no_child_pages')}</p>;
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
function ChildPageCard({ page }: { page: Page }) {
  return (
    <Link
      to="/docs/page/$id"
      params={{ id: page.id }}
      className="group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
    >
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-base group-hover:underline underline-offset-2">{page.name}</h3>
        {page.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{extractPlainText(page.description)}</p>
        )}
      </div>
      <ChevronRightIcon
        size={16}
        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </Link>
  );
}

/** Extract plain text from BlockNote JSON description for preview. */
function extractPlainText(description: string): string {
  try {
    const blocks = JSON.parse(description);
    const texts: string[] = [];
    for (const block of blocks) {
      if (block.content) {
        for (const inline of block.content) {
          if (inline.text) texts.push(inline.text);
        }
      }
      if (texts.length > 3) break;
    }
    return texts.join(' ').slice(0, 200);
  } catch {
    return description.slice(0, 200);
  }
}

export default ViewPage;
