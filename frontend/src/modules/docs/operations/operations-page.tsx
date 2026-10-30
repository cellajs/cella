import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary, GenTagSummary } from 'sdk/docs-types';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { useSearchParams } from '~/hooks/use-search-params';
import { NoRows } from '~/modules/common/data-table/no-rows';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { SearchScope } from '~/modules/common/match-highlight/match-scope';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { TagOperationsList } from '~/modules/docs/operations/operation-detail';
import { OperationsBar } from '~/modules/docs/operations/operations-bar';
import { filterOperations } from '~/modules/docs/operations/operations-filter';
import {
  nonEmptyTagsQueryOptions,
  operationsByTagQueryOptions,
  operationsQueryOptions,
  prefetchTagDetails,
  tagDetailsQueryOptions,
} from '~/modules/docs/query';
import { TagExpandLink } from '~/modules/docs/tag-expand-link';
import { TagOperationsTable } from '~/modules/docs/tag-operations-table';
import { TagSectionCard } from '~/modules/docs/tag-section-card';
import type { OperationsRouteSearchParams } from '~/modules/docs/types';

export function OperationsPage() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<OperationsRouteSearchParams>({ from: '/_public/_content/docs/operations' });
  const { q, filter, operationTag: activeTag } = search;

  const { prerender } = usePrerenderTrigger('operations');

  const { data: operations } = useSuspenseQuery(operationsQueryOptions);
  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: tags } = useSuspenseQuery(nonEmptyTagsQueryOptions);

  const sections = tags
    .map((tag) => ({ tag, operations: filterOperations(operationsByTag[tag.name] ?? [], { q, filter }) }))
    .filter((section) => section.operations.length > 0);
  const total = sections.reduce((sum, section) => sum + section.operations.length, 0);

  // Tag ids only: each tag's TagOperationsList adds its operation hashes once it mounts
  const tagSectionIds = sections.map(({ tag }) => `tag/${tag.name}`);

  useScrollSpy(tagSectionIds);

  // Retry hash scrolling on mount to cover child registration races and collapsed content layout.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && tagSectionIds.includes(hash)) scrollToSectionById(hash);
    // Mount only. Re-running on tag changes would fight user scrolling.
  }, []);

  return (
    <>
      <div className="container">
        <DocsPageHeader title={t('c:operation', { count: 2 })} />
      </div>

      <ScrollReset>
        {/* Leaves out the header, which focus view hides; no gap, so the sticky box's sentinel keeps the bar at the table view's height */}
        <FocusViewContainer className="gap-0">
          <OperationsBar operations={operations} total={total} search={{ q, filter }} setSearch={setSearch} sticky />

          <SearchScope q={q}>
            {sections.length > 0 ? (
              // A section a link scrolls to rests below a phone's open search, which pins over the page
              <div className="mt-2 flex flex-col gap-12 lg:gap-20 [&_[id^=spy-]]:scroll-mt-[calc(var(--sticky-stack-nav,0px)+1rem)]">
                {sections.map(({ tag, operations }) => (
                  <OperationTagSection
                    key={tag.name}
                    tag={tag}
                    operations={operations}
                    isOpen={activeTag === tag.name}
                    onPrerender={() => {
                      prefetchTagDetails(tag.name);
                      prerender(tag.name);
                    }}
                  />
                ))}
              </div>
            ) : (
              <NoRows isFiltered />
            )}
          </SearchScope>
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}

interface OperationTagSectionProps {
  tag: GenTagSummary;
  operations: GenOperationSummary[];
  isOpen: boolean;
  onPrerender: () => void;
}

function OperationTagSection({ tag, operations, isOpen, onPrerender }: OperationTagSectionProps) {
  // Defer page content mount by one frame so the sidebar can update first
  const [deferredIsOpen, setDeferredIsOpen] = useState(isOpen);
  useEffect(() => {
    if (!isOpen) {
      setDeferredIsOpen(false);
      return;
    }
    const frame = requestAnimationFrame(() => setDeferredIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // While open, the expand link spins until the tag's details arrive; the route loader already started that fetch
  const { isFetching: isFetchingDetails } = useQuery({ ...tagDetailsQueryOptions(tag.name), enabled: isOpen });

  return (
    <TagSectionCard
      scope="operations"
      name={tag.name}
      sectionId={`tag/${tag.name}`}
      description={tag.description}
      isOpen={deferredIsOpen}
      details={<TagOperationsList operations={operations} tagName={tag.name} />}
    >
      <TagOperationsTable operations={operations} tagName={tag.name} onPrerender={onPrerender} />
      <TagExpandLink
        isOpen={isOpen}
        loading={isOpen && isFetchingDetails}
        to="."
        search={(prev) => ({ ...prev, operationTag: isOpen ? undefined : tag.name })}
        tagName={tag.name}
        onMouseEnter={onPrerender}
      />
    </TagSectionCard>
  );
}
