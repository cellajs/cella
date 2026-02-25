import { useSuspenseQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from '@tanstack/react-router';
import { useMemo, useRef } from 'react';
import { nanoid } from 'shared/nanoid';
import { operationsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { TagItem } from './tag-item';

/** Sidebar listing operation tags with their operations. */
export function OperationsSidebar() {
  const layoutId = useRef(nanoid()).current;

  const { data: operations } = useSuspenseQuery(operationsQueryOptions);
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);
  const { operationTag: activeTag } = useSearch({ strict: false });
  const { hash } = useLocation();

  //
  const operationsByTag = useMemo(() => {
    const grouped = new Map<string, typeof operations>();
    for (const op of operations) {
      for (const tag of op.tags) {
        const existing = grouped.get(tag) ?? [];
        existing.push(op);
        grouped.set(tag, existing);
      }
    }
    return grouped;
  }, [operations]);

  return (
    <SidebarMenu className="gap-1 p-0 pt-1 pb-4">
      {tags.map((tag) => {
        const tagOperations = operationsByTag.get(tag.name) ?? [];
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
          />
        );
      })}
    </SidebarMenu>
  );
}
