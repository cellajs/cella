import i18n from 'i18next';
import { ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import { isRecord } from 'shared/utils/as-record';
import { CollapsedPreview } from '~/modules/common/json-viewer/collapsed-preview';
import { useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { CopyNodeButton } from '~/modules/common/json-viewer/copy-node-button';
import { NodeKey } from '~/modules/common/json-viewer/node-key';
import { InlinePrimitiveValue, PrimitiveValue } from '~/modules/common/json-viewer/primitive-value';
import { SchemaLabels } from '~/modules/common/json-viewer/schema-labels';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { useNodeExpansion } from '~/modules/common/json-viewer/use-node-expansion';
import { describeNode, getValueType, type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { cn } from '~/utils/cn';

interface JsonNodeProps {
  value: unknown;
  path: JsonPath;
  keyName: string | number | false;
  depth: number;
  /** Visual depth for indentation; does not increment for flattened nodes */
  visualDepth?: number;
}

function JsonNodeBase({ value, path, keyName, depth, visualDepth }: JsonNodeProps) {
  const effectiveVisualDepth = visualDepth ?? depth;

  const {
    indentWidth,
    defaultInspectDepth,
    enableClipboard,
    valueTypes,
    collapseStringsAfterLength,
    searchText,
    showKeyQuotes,
    hideDescriptions,
    openapiMode,
  } = useJsonViewerContext();

  // Flattened nodes render always expanded and without a key.
  const isPropertiesNode = openapiMode === 'schema' && keyName === 'properties';
  const isCompositionNode = openapiMode === 'schema' && (keyName === 'anyOf' || keyName === 'oneOf');
  const isFlattenedNode = isPropertiesNode || isCompositionNode;
  const isRootInSchemaMode = openapiMode === 'schema' && depth === 0;
  // 'items' nodes keep their header, so the array item structure stays visible.
  const hideExpandHeader = isFlattenedNode || isRootInSchemaMode;

  const { isExpanded, setIsExpanded, isCurrentMatch, rowRef, keyRef } = useNodeExpansion(path, hideExpandHeader || depth < defaultInspectDepth);

  const paddingLeft = effectiveVisualDepth * indentWidth * 8;
  const rowProps = { ref: rowRef, 'data-match-current': isCurrentMatch || undefined, style: { paddingLeft } };

  const valueType = getValueType(value);
  const keyProps = {
    keyName,
    showKeyQuotes,
    isObjectValue: valueType === 'object',
    hasSelfRequired: openapiMode === 'schema' && isRecord(value) && value.required === true,
    openapiMode,
    ref: keyRef,
  };

  const customType = valueTypes.find((dataType) => dataType.is(value, path));
  if (customType) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <NodeKey {...keyProps} />
        <customType.Component value={value} path={path} />
      </div>
    );
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return (
      <div {...rowProps} className="flex max-w-measure items-baseline whitespace-nowrap">
        <NodeKey {...keyProps} />
        <PrimitiveValue value={value} type={valueType} collapseStringsAfterLength={collapseStringsAfterLength} openapiMode={openapiMode} />
      </div>
    );
  }

  const { labels, entries, schemaPropertiesCount, isExpandable, isPrimitiveArray } = describeNode(
    value,
    openapiMode,
    isPropertiesNode,
    hideDescriptions,
  );
  const isArray = Array.isArray(value);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  if (entries.length === 0) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <NodeKey {...keyProps} />
        <span className={jsonViewerTheme.bracket}>{openBracket}</span>
        <SchemaLabels {...labels} />
        <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
      </div>
    );
  }

  if (isArray && isPrimitiveArray) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <NodeKey {...keyProps} />
        <span className={jsonViewerTheme.bracket}>[</span>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rendering an inline primitive array; items have no stable id.
          <span key={index}>
            <InlinePrimitiveValue value={item} />
            {index < value.length - 1 && <span className="text-faint-foreground">, </span>}
          </span>
        ))}
        <span className={jsonViewerTheme.bracket}>]</span>
      </div>
    );
  }

  const hiddenMatchCount = isExpanded ? 0 : matchRowPaths(value, searchText).length;

  return (
    <div>
      {!hideExpandHeader && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the whole row toggles for the mouse; the chevron button inside is the keyboard path.
        <div
          {...rowProps}
          className={cn(
            'group/node -mx-1 -my-px inline-flex items-center gap-0.5 rounded py-px pr-1',
            isExpandable ? 'cursor-pointer hover:bg-muted' : 'pointer-events-none',
          )}
          onClick={isExpandable ? () => setIsExpanded((prev) => !prev) : undefined}
        >
          {isExpandable ? (
            // No handler of its own: its click bubbles to the row, so Enter and Space toggle the node as a mouse click does.
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={i18n.t(isExpanded ? 'c:collapse' : 'c:expand')}
              className="focus-effect inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-60 focus-visible:opacity-100"
            >
              <ChevronRightIcon className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')} />
            </button>
          ) : (
            // A hidden chevron, not an empty spacer: the row's first flex item sets its baseline, as the button does on expandable rows.
            <ChevronRightIcon className="-ml-3 size-3.5 shrink-0 opacity-0" />
          )}
          <NodeKey {...keyProps} />
          <span className={jsonViewerTheme.bracket}>{openBracket}</span>
          <SchemaLabels {...labels} />
          {!isExpanded && isExpandable && (
            <CollapsedPreview itemCount={schemaPropertiesCount} closeBracket={closeBracket} hiddenMatchCount={hiddenMatchCount} />
          )}
          {enableClipboard && <CopyNodeButton value={value} />}
        </div>
      )}
      {(isExpanded || hideExpandHeader || !isExpandable) && (
        <div>
          {entries.map(([key, child]) => (
            <JsonNode
              key={String(key)}
              value={child}
              path={[...path, key]}
              keyName={key}
              depth={depth + 1}
              visualDepth={hideExpandHeader ? effectiveVisualDepth : effectiveVisualDepth + 1}
            />
          ))}
          {!hideExpandHeader && (
            <div style={{ paddingLeft }}>
              <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function jsonNodeEqual(prev: JsonNodeProps, next: JsonNodeProps) {
  if (prev.value !== next.value) return false;
  if (prev.keyName !== next.keyName) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.visualDepth !== next.visualDepth) return false;
  // Compare path arrays by value so a new reference does not re-render.
  if (prev.path.length !== next.path.length) return false;
  for (let i = 0; i < prev.path.length; i++) {
    if (prev.path[i] !== next.path[i]) return false;
  }
  return true;
}

export const JsonNode = memo(JsonNodeBase, jsonNodeEqual);
