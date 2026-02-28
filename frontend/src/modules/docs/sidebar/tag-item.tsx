import type { GenOperationSummary, GenTagSummary } from '~/modules/docs/types';
import { CollapsibleTagItem } from './collapsible-tag-item';
import { OperationItem } from './operation-item';

type TagItemProps = {
  tag: GenTagSummary;
  operations: GenOperationSummary[];
  isExpanded: boolean;
  isActive: boolean;
  activeOperationIndex: number;
  layoutId: string;
};

const getSearch = (isExpanded: boolean, tagName: string) => ({ operationTag: isExpanded ? undefined : tagName });
const getHash = (tagName: string) => `tag/${tagName}`;
const itemKey = (op: GenOperationSummary) => op.hash;
const renderItem = (op: GenOperationSummary, _index: number, isActive: boolean) => (
  <OperationItem operation={op} isActive={isActive} />
);

export function TagItem({ tag, operations, isExpanded, isActive, activeOperationIndex, layoutId }: TagItemProps) {
  return (
    <CollapsibleTagItem
      tag={tag}
      items={operations}
      isExpanded={isExpanded}
      isActive={isActive}
      activeItemIndex={activeOperationIndex}
      layoutId={layoutId}
      linkTo="/docs/operations"
      getSearch={getSearch}
      getHash={getHash}
      triggerClassName="text-left"
      renderItem={renderItem}
      itemKey={itemKey}
    />
  );
}
