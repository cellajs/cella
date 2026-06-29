import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { nanoid } from 'shared/nanoid';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { schemasByTagQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import type { GenComponentSchema } from '~/modules/docs/types';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { CollapsibleTagItem } from './collapsible-tag-item';
import { SchemaItem } from './schema-item';

const itemKey = (schema: GenComponentSchema) => schema.name;
const renderItem = (schema: GenComponentSchema, _index: number, isActive: boolean) => (
  <SchemaItem schema={schema} isActive={isActive} />
);

interface SchemasSidebarProps {
  activeTag?: string;
}

/** Sidebar listing schema tags with their schemas. */
export function SchemasSidebar({ activeTag }: SchemasSidebarProps) {
  const [layoutId] = useState(() => nanoid());
  const { prerender } = usePrerenderTrigger('schemas');

  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);
  const hash = useCurrentSection();

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {schemaTags.map((tag) => {
        const tagSchemas = schemasByTag[tag.name] ?? [];
        const isActive = hash === tag.name || tagSchemas.some((s) => s.ref.replace(/^#/, '') === hash);
        const activeSchemaIndex = tagSchemas.findIndex((s) => s.ref.replace(/^#/, '') === hash);

        return (
          <CollapsibleTagItem
            type="schemas"
            key={tag.name}
            tag={tag}
            items={tagSchemas}
            isExpanded={activeTag === tag.name}
            layoutId={layoutId}
            isActive={isActive}
            activeItemIndex={activeSchemaIndex}
            renderItem={renderItem}
            itemKey={itemKey}
            onPrerender={() => prerender(tag.name)}
          />
        );
      })}
    </SidebarMenu>
  );
}
