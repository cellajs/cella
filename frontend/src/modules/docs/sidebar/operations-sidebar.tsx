import { useSuspenseQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from '@tanstack/react-router';
import { useRef } from 'react';
import { nanoid } from 'shared/nanoid';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { operationsByTagQueryOptions, tagDetailsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { queryClient } from '~/query/query-client';
import { TagItem } from './tag-item';

/** Sidebar listing operation tags with their operations. */
export function OperationsSidebar() {
  const layoutId = useRef(nanoid()).current;
  const { prerender } = usePrerenderTrigger('operations');

  const { data: operationsByTag } = useSuspenseQuery(operationsByTagQueryOptions);
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);
  const { operationTag: activeTag } = useSearch({ strict: false });
  const { hash } = useLocation();

  return (
    <SidebarMenu className="gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => {
        const tagOperations = operationsByTag[tag.name] ?? [];
        const isActive = hash === `tag/${tag.name}` || hash?.startsWith(`tag/${tag.name}/`);
        const activeOperationIndex = tagOperations.findIndex((op) => op.hash === hash);

        return (
          <TagItem
            key={tag.name}
            tag={tag}
            operations={tagOperations}
            isExpanded={activeTag === tag.name}
            layoutId={layoutId}
            isActive={isActive}
            activeOperationIndex={activeOperationIndex}
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
