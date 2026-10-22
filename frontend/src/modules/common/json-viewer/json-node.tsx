import i18n from 'i18next';
import { ChevronRightIcon } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { isRecord } from 'shared/utils/as-record';
import { CollapsedPreview } from '~/modules/common/json-viewer/collapsed-preview';
import { useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { CopyNodeButton } from '~/modules/common/json-viewer/copy-node-button';
import { NodeKey } from '~/modules/common/json-viewer/node-key';
import { InlinePrimitiveValue, PrimitiveValue } from '~/modules/common/json-viewer/primitive-value';
import { type SchemaConstraints, SchemaLabels } from '~/modules/common/json-viewer/schema-labels';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { getValueType, isPathPrefix, type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { cn } from '~/utils/cn';

interface JsonNodeProps {
  value: unknown;
  path: JsonPath;
  keyName: string | number | false;
  depth: number;
  /** Visual depth for indentation; does not increment for flattened nodes */
  visualDepth?: number;
}

// Schema keywords that render as labels or inline constraints, so their own entries are hidden
const labelKeys = new Set<string | number>([
  'required',
  'maxLength',
  'minLength',
  'maximum',
  'minimum',
  'type',
  'ref',
  'contentType',
  'additionalProperties',
]);

// The $ref target's key: amber with a 2px ring, held for 70% of the time, then fading out
const refTargetFlash: Keyframe[] = [
  { backgroundColor: 'rgb(251 191 36)', boxShadow: '0 0 0 2px rgb(251 191 36)', borderRadius: '4px' },
  { backgroundColor: 'rgb(251 191 36)', boxShadow: '0 0 0 2px rgb(251 191 36)', borderRadius: '4px', offset: 0.7, easing: 'ease-out' },
  { backgroundColor: 'transparent', boxShadow: 'none', borderRadius: '4px' },
];

function JsonNodeBase({ value, path, keyName, depth, visualDepth }: JsonNodeProps) {
  const effectiveVisualDepth = visualDepth ?? depth;

  const {
    indentWidth,
    defaultInspectDepth,
    enableClipboard,
    valueTypes,
    collapseStringsAfterLength,
    targetPath,
    searchMatchPath,
    searchText,
    expandAll,
    showKeyQuotes,
    openapiMode,
  } = useJsonViewerContext();

  // Flattened nodes render always expanded and without a key.
  const isPropertiesNode = openapiMode === 'schema' && keyName === 'properties';
  const isCompositionNode = openapiMode === 'schema' && (keyName === 'anyOf' || keyName === 'oneOf');
  const isFlattenedNode = isPropertiesNode || isCompositionNode;
  const isRootInSchemaMode = openapiMode === 'schema' && depth === 0;
  // 'items' nodes keep their header, so the array item structure stays visible.
  const hideExpandHeader = isFlattenedNode || isRootInSchemaMode;

  const [isExpanded, setIsExpanded] = useState(hideExpandHeader || expandAll || depth < defaultInspectDepth);

  const isOnTargetPath = isPathPrefix(path, targetPath);
  const isOnSearchMatchPath = isPathPrefix(path, searchMatchPath);

  useEffect(() => {
    if (expandAll) setIsExpanded(true);
  }, [expandAll]);

  useEffect(() => {
    if (isOnTargetPath) setIsExpanded(true);
  }, [isOnTargetPath, targetPath]);

  useEffect(() => {
    if (isOnSearchMatchPath) setIsExpanded(true);
  }, [isOnSearchMatchPath, searchMatchPath]);

  const isCurrentMatch = isOnSearchMatchPath && path.length === searchMatchPath?.length;
  const rowRef = useRef<HTMLDivElement>(null);
  // Also runs on mount: a row inside a collapsed node exists only after its ancestors expanded.
  useEffect(() => {
    if (isCurrentMatch) rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [isCurrentMatch, searchMatchPath]);

  // targetPath is a new array per navigation, so following the same $ref again flashes again
  const isRefTarget = isOnTargetPath && path.length === targetPath?.length;
  const keyRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isRefTarget) return;
    keyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    keyRef.current?.animate(refTargetFlash, 3000);
  }, [isRefTarget, targetPath]);

  const paddingLeft = effectiveVisualDepth * indentWidth * 8;
  const rowProps = { ref: rowRef, 'data-match-current': isCurrentMatch || undefined, style: { paddingLeft } };

  const valueType = getValueType(value);
  const schemaRecord = openapiMode === 'schema' && isRecord(value) ? value : null;
  const keyProps = {
    keyName,
    showKeyQuotes,
    isObjectValue: valueType === 'object',
    hasSelfRequired: schemaRecord?.required === true,
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
      <div {...rowProps} className="whitespace-nowrap">
        <NodeKey {...keyProps} />
        <PrimitiveValue value={value} type={valueType} collapseStringsAfterLength={collapseStringsAfterLength} openapiMode={openapiMode} />
      </div>
    );
  }

  const isArray = Array.isArray(value);

  // A 'properties' node's keys are property names, so none of them is read or hidden as a schema keyword.
  const keywords = isPropertiesNode ? null : schemaRecord;

  // 'type' renders as a label: a string, or an array such as ["string", "null"] for nullable.
  const typeValue = (() => {
    const typeField = keywords?.type;
    if (typeof typeField === 'string') return typeField;
    if (Array.isArray(typeField) && typeField.every((type): type is string => typeof type === 'string')) return typeField;
    return null;
  })();

  // anyOf/oneOf render as a type label.
  const hasAnyOf = Array.isArray(keywords?.anyOf);
  const hasOneOf = Array.isArray(keywords?.oneOf);

  // 'ref' renders as a label holding only the schema name: '#/components/schemas/User' becomes 'User'.
  const refField = keywords?.ref;
  const refValue = typeof refField === 'string' ? refField.split('/').pop() || refField : null;

  // Rendered as a label and filtered out of the entries below.
  const contentTypeField = keywords?.contentType;
  const contentTypeValue = typeof contentTypeField === 'string' ? contentTypeField : null;

  // Rendered inline and filtered out of the entries below.
  const constraints = (() => {
    if (!schemaRecord) return null;
    const found: SchemaConstraints = {};
    if (typeof schemaRecord.maxLength === 'number') found.maxLength = schemaRecord.maxLength;
    if (typeof schemaRecord.minLength === 'number') found.minLength = schemaRecord.minLength;
    if (typeof schemaRecord.maximum === 'number') found.maximum = schemaRecord.maximum;
    if (typeof schemaRecord.minimum === 'number') found.minimum = schemaRecord.minimum;
    return Object.keys(found).length > 0 ? found : null;
  })();

  // Rendered as a synthetic [key] entry.
  const additionalProperties = keywords?.additionalProperties;
  const additionalPropertiesSchema = additionalProperties && typeof additionalProperties === 'object' ? additionalProperties : null;

  const isArraySchema = schemaRecord?.type === 'array';

  const rawEntries: [string | number, unknown][] = isArray ? value.map((item, index) => [index, item]) : Object.entries(value);

  // Hide schema keys promoted into labels and hoist array-item properties.
  const filteredEntries =
    openapiMode === 'schema' && !isArray
      ? rawEntries.filter(([key]) => (isPropertiesNode || !labelKeys.has(key)) && !(isArraySchema && key === 'items'))
      : rawEntries;

  const items = schemaRecord?.items;
  const hoistedItemsEntries = isArraySchema && isRecord(items) && isRecord(items.properties) ? Object.entries(items.properties) : [];

  const combinedEntries = [...filteredEntries, ...hoistedItemsEntries];

  // Primitives sort before objects and arrays.
  const entries =
    openapiMode === 'schema' && !isArray
      ? [...combinedEntries].sort(([, a], [, b]) => {
          const aIsObject = a !== null && typeof a === 'object';
          const bIsObject = b !== null && typeof b === 'object';
          if (aIsObject === bIsObject) return 0;
          return aIsObject ? 1 : -1;
        })
      : filteredEntries;

  if (additionalPropertiesSchema) {
    entries.push(['[key]', additionalPropertiesSchema]);
  }

  // Counts the children a reader actually sees.
  const schemaPropertiesCount = (() => {
    if (isArraySchema) return hoistedItemsEntries.length;
    const properties = schemaRecord?.properties;
    return properties && typeof properties === 'object' ? Object.keys(properties).length : entries.length;
  })();

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const isEmpty = entries.length === 0;

  // Schema mode: an object is expandable only if it has nested object (not array) children; arrays are always expandable.
  const isExpandable = openapiMode === 'schema' && !isArray ? entries.some(([, child]) => isRecord(child)) : true;

  if (isEmpty) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <NodeKey {...keyProps} />
        <span className={jsonViewerTheme.bracket}>{openBracket}</span>
        <SchemaLabels
          typeValue={typeValue}
          refValue={refValue}
          contentTypeValue={contentTypeValue}
          hasAnyOf={hasAnyOf}
          hasOneOf={hasOneOf}
          constraints={constraints}
        />
        <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
      </div>
    );
  }

  const isPrimitiveArray =
    isArray && openapiMode === 'schema' && value.every((item) => item === null || (typeof item !== 'object' && typeof item !== 'undefined'));

  if (isPrimitiveArray) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <NodeKey {...keyProps} />
        <span className={jsonViewerTheme.bracket}>[</span>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rendering an inline primitive array; items have no stable id.
          <span key={index}>
            <InlinePrimitiveValue value={item} />
            {index < value.length - 1 && <span className="opacity-70">, </span>}
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
            isExpandable ? 'cursor-pointer hover:bg-accent/50' : 'pointer-events-none',
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
          <SchemaLabels
            typeValue={typeValue}
            refValue={refValue}
            contentTypeValue={contentTypeValue}
            hasAnyOf={hasAnyOf}
            hasOneOf={hasOneOf}
            constraints={constraints}
          />
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
