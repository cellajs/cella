import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { nanoid } from 'shared/nanoid';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { operationsByTagQueryOptions, tagDetailsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import type { GenOperationSummary } from '~/modules/docs/types';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { queryClient } from '~/query/query-client';
import { CollapsibleTagItem } from './collapsible-tag-item';
import { OperationItem } from './operation-item';

const itemKey = (op: GenOperationSummary) => op.hash;
const renderItem = (op: GenOperationSummary, _index: number, isActive: boolean) => (
  <OperationItem operation={op} isActive={isActive} />
);

interface OperationsSidebarProps {
  activeTag?: string;
}

/** Sidebar listing operation tags with their operations. */
export function OperationsSidebar({ activeTag }: OperationsSidebarProps) {
  const layoutId = useRef(nanoid()).current;
  const { prerender } = usePrerenderTrigger('operations');

  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);
  const hash = useCurrentSection();

  return (
    <SidebarMenu className="gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => {
        const tagOperations = operationsByTag[tag.name] ?? [];
        const isActive = hash === `tag/${tag.name}` || hash?.startsWith(`tag/${tag.name}/`);
        const activeOperationIndex = tagOperations.findIndex((op) => op.hash === hash);

        return (
          <CollapsibleTagItem
            type="operations"
            key={tag.name}
            tag={tag}
            items={tagOperations}
            isExpanded={activeTag === tag.name}
            layoutId={layoutId}
            isActive={isActive}
            activeItemIndex={activeOperationIndex}
            renderItem={renderItem}
            itemKey={itemKey}
            onPrerender={() => {
              queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name));
              prerender(tag.name);
            }}
          />
        );
      })}
    </SidebarMenu>
  );
}
