import { useSuspenseQuery } from '@tanstack/react-query';
import { useId } from 'react';
import type { GenOperationSummary } from 'sdk/docs-types';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { filterOperations, useOperationSearch } from '~/modules/docs/operations/operations-filter';
import { nonEmptyTagsQueryOptions, operationsByTagQueryOptions, prefetchTagDetails } from '~/modules/docs/query';
import { CollapsibleTagItem } from '~/modules/docs/sidebar/collapsible-tag-item';
import { OperationItem } from '~/modules/docs/sidebar/operation-item';
import { SidebarMenu } from '~/modules/ui/sidebar';

const itemKey = (op: GenOperationSummary) => op.hash;
const renderItem = (op: GenOperationSummary, isActive: boolean) => <OperationItem operation={op} isActive={isActive} />;

interface OperationsSidebarProps {
  activeTag?: string;
  /** The operations page is open: off it, a tag only links there. */
  isOnRoute: boolean;
}

export function OperationsSidebar({ activeTag, isOnRoute }: OperationsSidebarProps) {
  const layoutId = useId();
  const { prerender } = usePrerenderTrigger('operations');

  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: tags } = useSuspenseQuery(nonEmptyTagsQueryOptions);
  const hash = useCurrentSection();
  const search = useOperationSearch();

  return (
    <SidebarMenu className="gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => {
        const isExpanded = activeTag === tag.name;
        // Only pass items for expanded tag to avoid mounting all operations upfront
        const tagOperations = isExpanded ? (operationsByTag[tag.name] ?? []) : [];
        const isAtTag = hash === `tag/${tag.name}`;
        const isActive = isAtTag || hash.startsWith(`tag/${tag.name}/`);
        const activeOperationIndex = tagOperations.findIndex((op) => op.hash === hash);

        return (
          <CollapsibleTagItem
            type="operations"
            key={tag.name}
            tag={tag}
            items={tagOperations}
            isExpanded={isExpanded}
            layoutId={layoutId}
            isActive={isActive}
            isAtTag={isAtTag}
            isOnRoute={isOnRoute}
            isHidden={!filterOperations(operationsByTag[tag.name] ?? [], search).length}
            activeItemIndex={activeOperationIndex}
            renderItem={renderItem}
            itemKey={itemKey}
            onPrerender={() => {
              prefetchTagDetails(tag.name);
              prerender(tag.name);
            }}
          />
        );
      })}
    </SidebarMenu>
  );
}
