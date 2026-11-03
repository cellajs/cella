import { memo } from 'react';
import type { GenComponentSchema } from 'sdk/docs-types';
import { schemaLinkOptions } from '~/modules/docs/helpers/reference-links';
import { SidebarHashItem } from '~/modules/docs/sidebar/sidebar-hash-item';

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
