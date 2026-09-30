import { memo } from 'react';
import type { GenComponentSchema } from 'sdk/docs-types';
import { SidebarHashItem } from './sidebar-hash-item';

type SchemaItemProps = {
  schema: GenComponentSchema;
  isActive: boolean;
};

function SchemaItemBase({ schema, isActive }: SchemaItemProps) {
  return (
    <SidebarHashItem
      to="/docs/schemas"
      hash={schema.ref.replace(/^#/, '')}
      isActive={isActive}
      className="justify-start"
    >
      <span className="truncate text-sm">{schema.name}</span>
    </SidebarHashItem>
  );
}

function schemaItemEqual(prev: SchemaItemProps, next: SchemaItemProps) {
  return prev.schema === next.schema && prev.isActive === next.isActive;
}

export const SchemaItem = memo(SchemaItemBase, schemaItemEqual);
