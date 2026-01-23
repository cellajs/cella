import { useSuspenseQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from '@tanstack/react-router';
import { useMemo, useRef } from 'react';
import { schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { nanoid } from '~/utils/nanoid';
import { SchemaTagItem } from './schema-tag-item';

/** Sidebar listing schema tags with their schemas. */
export function SchemasSidebar() {
  const layoutId = useRef(nanoid()).current;

  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);
  const { schemaTag: activeTag } = useSearch({ strict: false });
  const { hash } = useLocation();

  const schemasByTag = useMemo(() => {
    const grouped = new Map<string, typeof schemas>();
    for (const schema of schemas) {
      if (schema.schemaTag) {
        const existing = grouped.get(schema.schemaTag) ?? [];
        existing.push(schema);
        grouped.set(schema.schemaTag, existing);
      }
    }
    return grouped;
  }, [schemas]);

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {schemaTags.map((tag) => {
        const tagSchemas = schemasByTag.get(tag.name) ?? [];
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
          />
        );
      })}
    </SidebarMenu>
  );
}
