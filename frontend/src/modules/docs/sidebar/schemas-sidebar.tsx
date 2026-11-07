import { useSuspenseQuery } from '@tanstack/react-query';
import { memo, useId } from 'react';
import type { GenComponentSchema } from 'sdk/docs-types';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { schemaAnchor, schemaLinkOptions } from '~/modules/docs/helpers/reference-links';
import { schemasByTagQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { CollapsibleTagItem } from '~/modules/docs/sidebar/collapsible-tag-item';
import { SidebarHashItem } from '~/modules/docs/sidebar/sidebar-hash-item';
import { SidebarMenu } from '~/modules/ui/sidebar';

interface SchemaItemProps {
  schema: GenComponentSchema;
  isActive: boolean;
}

function SchemaItemBase({ schema, isActive }: SchemaItemProps) {
  return (
    <SidebarHashItem link={schemaLinkOptions(schema)} isActive={isActive}>
      <span className="truncate">{schema.name}</span>
    </SidebarHashItem>
  );
}

export const SchemaItem = memo(SchemaItemBase);

const itemKey = (schema: GenComponentSchema) => schema.name;
const renderItem = (schema: GenComponentSchema, isActive: boolean) => <SchemaItem schema={schema} isActive={isActive} />;

interface SchemasSidebarProps {
  activeTag?: string;
  isOnRoute: boolean;
}

export function SchemasSidebar({ activeTag, isOnRoute }: SchemasSidebarProps) {
  const layoutId = useId();
  const { prerender } = usePrerenderTrigger('schemas');

  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);
  const hash = useCurrentSection();

  return (
    <SidebarMenu className="no-focus-ring:gap-0 gap-1 p-0 pt-1">
      {schemaTags.map((tag) => {
        const tagSchemas = schemasByTag[tag.name] ?? [];
        const isAtTag = hash === `tag/${tag.name}`;
        const activeSchemaIndex = tagSchemas.findIndex((schema) => schemaAnchor(schema) === hash);
        const isActive = isAtTag || activeSchemaIndex >= 0;

        return (
          <CollapsibleTagItem
            type="schemas"
            key={tag.name}
            items={tagSchemas}
            isExpanded={activeTag === tag.name}
            {...{ tag, layoutId, isActive, isAtTag, isOnRoute, renderItem, itemKey }}
            activeItemIndex={activeSchemaIndex}
            onPrerender={() => prerender(tag.name)}
          />
        );
      })}
    </SidebarMenu>
  );
}
