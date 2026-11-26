import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { memo, useId } from 'react';
import type { GenOperationSummary } from 'sdk/docs-types';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { operationLinkOptions } from '~/modules/docs/helpers/reference-links';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { filterOperations } from '~/modules/docs/operations/operations-filter';
import { isSwitchedOff, StruckText } from '~/modules/docs/operations/switched-off-badge';
import { nonEmptyTagsQueryOptions, operationsByTagQueryOptions, prefetchTagDetails } from '~/modules/docs/query';
import { CollapsibleTagItem } from '~/modules/docs/sidebar/collapsible-tag-item';
import { SidebarHashItem } from '~/modules/docs/sidebar/sidebar-hash-item';
import type { OperationSearch } from '~/modules/docs/types';
import { SidebarMenu } from '~/modules/ui/sidebar';

/** The search in the URL: the sidebar sits in the docs layout, outside the operations route. */
function useOperationSearch(): OperationSearch {
  const q = useRouterState({ select: (state) => state.location.search.q });
  const filter = useRouterState({ select: (state) => state.location.search.filter });
  return { q, filter };
}

function OperationItemBase({ operation, isActive }: { operation: GenOperationSummary; isActive: boolean }) {
  const search = useOperationSearch();
  const off = isSwitchedOff(operation.enabledBy);

  return (
    <SidebarHashItem link={operationLinkOptions(operation)} isActive={isActive} isHidden={!filterOperations([operation], search).length}>
      <span className="flex-1 truncate">
        <StruckText struck={off}>{operation.summary || operation.id}</StruckText>
      </span>
      <MethodLabel method={operation.method} off={off} />
    </SidebarHashItem>
  );
}

export const OperationItem = memo(OperationItemBase);

const itemKey = (op: GenOperationSummary) => op.hash;
const renderItem = (op: GenOperationSummary, isActive: boolean) => <OperationItem operation={op} isActive={isActive} />;

export function OperationsSidebar({ activeTag, isOnRoute }: { activeTag?: string; isOnRoute: boolean }) {
  const layoutId = useId();
  const { prerender } = usePrerenderTrigger('operations');

  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: tags } = useSuspenseQuery(nonEmptyTagsQueryOptions);
  const hash = useCurrentSection();
  const search = useOperationSearch();

  return (
    <SidebarMenu className="no-focus-ring:gap-0 gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => {
        const isExpanded = activeTag === tag.name;
        const allOperations = operationsByTag[tag.name] ?? [];
        // Only pass items for expanded tag to avoid mounting all operations upfront
        const tagOperations = isExpanded ? allOperations : [];
        const isAtTag = hash === `tag/${tag.name}`;
        const isActive = isAtTag || hash.startsWith(`tag/${tag.name}/`);
        const activeOperationIndex = tagOperations.findIndex((op) => op.hash === hash);

        return (
          <CollapsibleTagItem
            type="operations"
            key={tag.name}
            items={tagOperations}
            {...{ tag, isExpanded, layoutId, isActive, isAtTag, isOnRoute, renderItem, itemKey }}
            isHidden={!filterOperations(allOperations, search).length}
            isOff={allOperations.length > 0 && allOperations.every((op) => isSwitchedOff(op.enabledBy))}
            activeItemIndex={activeOperationIndex}
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
