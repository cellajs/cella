import type { GenComponentSchema, GenSchemaTagSummary, SchemaTag } from '~/modules/docs/types';
import { CollapsibleTagItem } from './collapsible-tag-item';
import { SchemaItem } from './schema-item';

type SchemaTagItemProps = {
  tag: GenSchemaTagSummary;
  schemas: GenComponentSchema[];
  isExpanded: boolean;
  isActive: boolean;
  activeSchemaIndex: number;
  layoutId: string;
};

const getSearch = (isExpanded: boolean, tagName: string) => ({
  schemaTag: isExpanded ? undefined : (tagName as SchemaTag),
});
const getHash = (tagName: string) => tagName;
const itemKey = (schema: GenComponentSchema) => schema.name;
const renderItem = (schema: GenComponentSchema, _index: number, isActive: boolean) => (
  <SchemaItem schema={schema} isActive={isActive} />
);

export function SchemaTagItem({ tag, schemas, isExpanded, isActive, activeSchemaIndex, layoutId }: SchemaTagItemProps) {
  return (
    <CollapsibleTagItem
      tag={tag}
      items={schemas}
      isExpanded={isExpanded}
      isActive={isActive}
      activeItemIndex={activeSchemaIndex}
      layoutId={layoutId}
      linkTo="/docs/schemas"
      getSearch={getSearch}
      getHash={getHash}
      triggerClassName="justify-start lowercase"
      renderItem={renderItem}
      itemKey={itemKey}
    />
  );
}
