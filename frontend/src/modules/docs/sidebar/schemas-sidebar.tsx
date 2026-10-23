import { useSuspenseQuery } from '@tanstack/react-query';
import { useId } from 'react';
import type { GenComponentSchema } from 'sdk/docs-types';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { schemaAnchor } from '~/modules/docs/helpers/schema-anchor';
import { schemasByTagQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { CollapsibleTagItem } from '~/modules/docs/sidebar/collapsible-tag-item';
import { SchemaItem } from '~/modules/docs/sidebar/schema-item';
import { SidebarMenu } from '~/modules/ui/sidebar';

const itemKey = (schema: GenComponentSchema) => schema.name;
const renderItem = (schema: GenComponentSchema, isActive: boolean) => <SchemaItem schema={schema} isActive={isActive} />;

interface SchemasSidebarProps {
  activeTag?: string;
}

export function SchemasSidebar({ activeTag }: SchemasSidebarProps) {
  const layoutId = useId();
  const { prerender } = usePrerenderTrigger('schemas');

  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);
  const hash = useCurrentSection();

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {schemaTags.map((tag) => {
        const tagSchemas = schemasByTag[tag.name] ?? [];
        const isAtTag = hash === tag.name;
        const activeSchemaIndex = tagSchemas.findIndex((schema) => schemaAnchor(schema) === hash);
        const isActive = isAtTag || activeSchemaIndex >= 0;

        return (
          <CollapsibleTagItem
            type="schemas"
            key={tag.name}
            tag={tag}
            items={tagSchemas}
            isExpanded={activeTag === tag.name}
            layoutId={layoutId}
            isActive={isActive}
            isAtTag={isAtTag}
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
