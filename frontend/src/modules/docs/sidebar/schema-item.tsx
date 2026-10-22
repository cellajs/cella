import { memo } from 'react';
import type { GenComponentSchema } from 'sdk/docs-types';
import { schemaAnchor } from '~/modules/docs/helpers/schema-anchor';
import { SidebarHashItem } from '~/modules/docs/sidebar/sidebar-hash-item';

interface SchemaItemProps {
  schema: GenComponentSchema;
  isActive: boolean;
}

function SchemaItemBase({ schema, isActive }: SchemaItemProps) {
  return (
    <SidebarHashItem to="/docs/schemas" hash={schemaAnchor(schema)} isActive={isActive} className="justify-start">
      <span className="truncate text-sm">{schema.name}</span>
    </SidebarHashItem>
  );
}

export const SchemaItem = memo(SchemaItemBase);
