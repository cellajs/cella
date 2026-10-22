import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary, GenTagSummary } from 'sdk/docs-types';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { StickyBox } from '~/modules/common/sticky-box';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { TagOperationsList } from '~/modules/docs/operations/operation-detail';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';
import { nonEmptyTagsQueryOptions, operationsByTagQueryOptions, prefetchTagDetails, tagDetailsQueryOptions } from '~/modules/docs/query';
import { TagExpandLink } from '~/modules/docs/tag-expand-link';
import { TagOperationsTable } from '~/modules/docs/tag-operations-table';
import { TagSectionCard } from '~/modules/docs/tag-section-card';

function OperationsPage() {
  const { t } = useTranslation();
  const { operationTag: activeTag } = useSearch({ from: '/_public/_content/docs/operations' });

  const { prerender } = usePrerenderTrigger('operations');

  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: tags } = useSuspenseQuery(nonEmptyTagsQueryOptions);

  const operationCount = tags.reduce((sum, tag) => sum + tag.count, 0);

  // Operation hashes are contributed by OperationDetail when rendered
  const tagSectionIds = tags.map((tag) => `tag/${tag.name}`);

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
        <DocsPageHeader title={t('c:operation', { count: 2 })} className="pb-2" />
      </div>

      <StickyBox className="z-10 bg-background/60 backdrop-blur-xs" hideWhenOutOfView>
        <div className="container flex items-center gap-3 py-3">
          <ViewModeToggle />

          <span className="text-muted-foreground text-sm lowercase">
            {operationCount} {t('c:operation', { count: operationCount })}
          </span>
        </div>
      </StickyBox>

      <div className="container flex flex-col gap-12 lg:gap-20">
        {tags.map((tag) => (
          <OperationTagSection
            key={tag.name}
            tag={tag}
            operations={operationsByTag[tag.name] || []}
            isOpen={activeTag === tag.name}
            onPrerender={() => {
              prefetchTagDetails(tag.name);
              prerender(tag.name);
            }}
          />
        ))}
      </div>
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

  // `enabled: isOpen` keeps tag details dormant until the user expands the section
  const { isFetching: isFetchingDetails } = useQuery({ ...tagDetailsQueryOptions(tag.name), enabled: isOpen });

  return (
    <TagSectionCard
      scope="operations"
      name={tag.name}
      sectionId={`tag/${tag.name}`}
      description={tag.description}
      isOpen={deferredIsOpen}
      details={<TagOperationsList operations={operations} />}
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

export { OperationsPage };
