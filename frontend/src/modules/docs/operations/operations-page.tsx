import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrerenderSection, usePrerenderTrigger } from '~/hooks/use-prerender';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { StickyBox } from '~/modules/common/sticky-box';
import { TagOperationsList } from '~/modules/docs/operations/operation-detail';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';
import { operationsByTagQueryOptions, tagDetailsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { TagExpandLink } from '~/modules/docs/tag-expand-link';
import { TagOperationsTable } from '~/modules/docs/tag-operations-table';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';
import { getHashUrl } from '../hash-url';

function OperationsPage() {
  const { t } = useTranslation();
  // Get active tag from URL search param
  const { operationTag: activeTag } = useSearch({ from: '/_public/_content/docs/operations' });

  // Prerender trigger for hover-intent DOM preparation
  const { prerender } = usePrerenderTrigger('operations');

  // Fetch operations grouped by tag, and tags list (exclude empty tags)
  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: allTags } = useSuspenseQuery(tagsQueryOptions);
  const tags = allTags.filter((t) => t.count > 0);

  // Total operation count derived from tags
  const operationCount = tags.reduce((sum, t) => sum + t.count, 0);

  // Tag section IDs - operation hashes are contributed by OperationDetail when rendered
  const tagSectionIds = tags.map((t) => `tag/${t.name}`);

  // Enable scroll spy with tag section IDs
  useScrollSpy(tagSectionIds);

  // Backstop: if the URL has a hash matching one of our tag sections, scroll to it on mount.
  // The spy store handles the common case during registerSections, but this guarantees the
  // scroll happens even if a child registration races ahead (e.g. when tag details are cached).
  // scrollToSectionById queues and retries until the target is laid out, so it's safe to call
  // before the (possibly prerendered) collapsible content has expanded.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && tagSectionIds.includes(hash)) scrollToSectionById(hash);
    // Mount only — re-running on tag changes would fight user scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <StickyBox className="z-10 bg-background/60 backdrop-blur-xs" hideWhenOutOfView>
        <div className="container flex items-center gap-3 py-5">
          <ViewModeToggle />

          <span className="text-muted-foreground text-sm lowercase">
            {operationCount} {t('c:operation', { count: operationCount })}
          </span>
        </div>
      </StickyBox>

      <div className="container flex flex-col gap-12 lg:gap-20">
        {tags.map((tag) => (
          <TagSection
            key={tag.name}
            tag={tag}
            operations={operationsByTag[tag.name] || []}
            isOpen={activeTag === tag.name}
            onPrerender={() => {
              queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name));
              prerender(tag.name);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface TagSectionProps {
  tag: { name: string; description?: string; count: number };
  operations: GenOperationSummary[];
  isOpen: boolean;
  onPrerender: () => void;
}

/**
 * Single tag section with prerender-aware collapsible content.
 * Extracted as component so usePrerenderSection hook can be called per-tag.
 */
function TagSection({ tag, operations, isOpen, onPrerender }: TagSectionProps) {
  // Defer page content mount by one frame so the sidebar can update first
  const [deferredIsOpen, setDeferredIsOpen] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setDeferredIsOpen(true));
    } else {
      setDeferredIsOpen(false);
    }
  }, [isOpen]);

  const { shouldMount, style } = usePrerenderSection('operations', tag.name, deferredIsOpen);

  // Track tag-details loading so the expand link can swap chevron → spinner while open.
  // `enabled: isOpen` keeps this dormant until the user actually expands the section.
  const { isFetching: detailsLoading } = useQuery({ ...tagDetailsQueryOptions(tag.name), enabled: isOpen });

  return (
    <Collapsible open={deferredIsOpen}>
      <Card id={`spy-tag/${tag.name}`} className={cn('scroll-mt-4 border-0', deferredIsOpen && 'rounded-b-none')}>
        <CardHeader className="group">
          <CardTitle className="gap-2 text-2xl leading-12">
            {tag.name}
            <HashUrlButton url={getHashUrl(`tag/${tag.name}`)} />
          </CardTitle>
          {tag.description && <CardDescription className="my-2 max-w-4xl text-base">{tag.description}</CardDescription>}
        </CardHeader>
        <CardContent className="rdg-readonly flex flex-col gap-4">
          {/* Readonly data table with operations in this tag */}
          <TagOperationsTable operations={operations} tagName={tag.name} onPrerender={onPrerender} />

          {/* Show details button */}
          <TagExpandLink
            isOpen={isOpen}
            loading={isOpen && detailsLoading}
            to="."
            search={(prev) => ({ ...prev, operationTag: isOpen ? undefined : tag.name })}
            onMouseEnter={onPrerender}
          />
        </CardContent>
      </Card>

      {/* Operation details list — prerendered with content-visibility: hidden on hover */}
      {shouldMount && (
        <CollapsibleContent keepMounted>
          <div style={style}>
            <Suspense>
              <TagOperationsList operations={operations} />
            </Suspense>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export default OperationsPage;
