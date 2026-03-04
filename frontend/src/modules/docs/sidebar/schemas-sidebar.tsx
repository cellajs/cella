import { useSuspenseQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from '@tanstack/react-router';
import { useRef } from 'react';
import { nanoid } from 'shared/nanoid';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { schemasByTagQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { SchemaTagItem } from './schema-tag-item';

/** Sidebar listing schema tags with their schemas. */
export function SchemasSidebar() {
  const layoutId = useRef(nanoid()).current;
  const { prerender } = usePrerenderTrigger('schemas');

  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);
  const { schemaTag: activeTag } = useSearch({ strict: false });
  const { hash } = useLocation();

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {schemaTags.map((tag) => {
        const tagSchemas = schemasByTag[tag.name] ?? [];
        const isActive = hash === tag.name || tagSchemas.some((s) => s.ref.replace(/^#/, '') === hash);
        const activeSchemaIndex = tagSchemas.findIndex((s) => s.ref.replace(/^#/, '') === hash);

        return (
          <SchemaTagItem
            key={tag.name}
            tag={tag}
            schemas={tagSchemas}
            isExpanded={activeTag === tag.name}
            layoutId={layoutId}
            isActive={isActive}
            activeSchemaIndex={activeSchemaIndex}
            onPrerender={() => prerender(tag.name)}
          />
        );
      })}
    </SidebarMenu>
  );
}
