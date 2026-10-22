import i18n from 'i18next';
import { ChevronRightIcon } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { isRecord } from 'shared/utils/as-record';
import { CollapsedPreview } from '~/modules/common/json-viewer/collapsed-preview';
import { useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { CopyButton } from '~/modules/common/json-viewer/copy-button';
import { KeyRenderer } from '~/modules/common/json-viewer/key-renderer';
import { InlinePrimitiveValue, PrimitiveValue } from '~/modules/common/json-viewer/primitive-value';
import { SchemaLabels } from '~/modules/common/json-viewer/schema-labels';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { getTypeLabel, getValueType, isPathPrefix, type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { cn } from '~/utils/cn';

interface JsonNodeProps {
  value: unknown;
  path: JsonPath;
  keyName: string | number | false;
  depth: number;
  /** Visual depth for indentation; does not increment for flattened nodes */
  visualDepth?: number;
  /** How many more levels to auto-expand, passed down when a parent expands */
  cascadeDepth?: number;
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

function JsonNodeBase({ value, path, keyName, depth, visualDepth, cascadeDepth = 0 }: JsonNodeProps) {
  const effectiveVisualDepth = visualDepth ?? depth;

  const {
    indentWidth,
    defaultInspectDepth,
    displayDataTypes,
    enableClipboard,
    valueTypes,
    collapseStringsAfterLength,
    targetPath,
    searchMatchPath,
    searchText,
    expandAll,
    showKeyQuotes,
    expandChildrenDepth,
    openapiMode,
  } = useJsonViewerContext();

  const singleLineArrays = openapiMode === 'schema';

  const [childCascadeDepth, setChildCascadeDepth] = useState(0);

  // Flattened nodes render always expanded and without a key.
  const isPropertiesNode = openapiMode === 'schema' && keyName === 'properties';
  const isCompositionNode = openapiMode === 'schema' && (keyName === 'anyOf' || keyName === 'oneOf');
  const isFlattenedNode = isPropertiesNode || isCompositionNode;

  const isRootInSchemaMode = openapiMode === 'schema' && depth === 0;

  const getDefaultExpanded = () => {
    if (isFlattenedNode || isRootInSchemaMode) return true;
    if (cascadeDepth > 0) return true;
    if (expandAll) return true;
    return depth < defaultInspectDepth;
  };

  const [isExpanded, setIsExpanded] = useState(getDefaultExpanded);

  const isOnTargetPath = isPathPrefix(path, targetPath);
  const isOnSearchMatchPath = isPathPrefix(path, searchMatchPath);

  useEffect(() => {
    if (expandAll && !isExpanded) {
      setIsExpanded(true);
    }
  }, [expandAll]);

  // Expanding along the target path leaves other nodes untouched.
  useEffect(() => {
    if (isOnTargetPath && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isOnTargetPath, targetPath]);

  useEffect(() => {
    if (isOnSearchMatchPath && !isExpanded) {
      setIsExpanded(true);
    }
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
  const typeLabel = displayDataTypes && <span className="ml-2 text-muted-foreground text-sm">{getTypeLabel(value, valueType)}</span>;

  const customType = valueTypes.find((dataType) => dataType.is(value, path));
  if (customType) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <KeyRenderer {...keyProps} />
        <customType.Component value={value} path={path} />
      </div>
    );
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <KeyRenderer {...keyProps} />
        <PrimitiveValue value={value} type={valueType} collapseStringsAfterLength={collapseStringsAfterLength} openapiMode={openapiMode} />
        {typeLabel}
      </div>
    );
  }

  const isArray = Array.isArray(value);

  // A 'properties' node's keys are property names, so none of them is read or hidden as a schema keyword.
  const parentKey = path.length > 0 ? path[path.length - 1] : null;
  const isInsideProperties = parentKey === 'properties';
  const valueObj = isInsideProperties ? null : schemaRecord;

  // 'type' renders as a label: a string, or an array such as ["string", "null"] for nullable.
  const typeValue = (() => {
    const typeField = valueObj?.type;
    if (typeof typeField === 'string') return typeField;
    if (Array.isArray(typeField) && typeField.every((type): type is string => typeof type === 'string')) return typeField;
    return null;
  })();

  // anyOf/oneOf render as a type label.
  const hasAnyOf = Array.isArray(valueObj?.anyOf);
  const hasOneOf = Array.isArray(valueObj?.oneOf);

  // 'ref' renders as a label holding only the schema name: '#/components/schemas/User' becomes 'User'.
  const refField = valueObj?.ref;
  const refValue = typeof refField === 'string' ? refField.split('/').pop() || refField : null;

  // Rendered as a label and filtered out of the entries below.
  const contentTypeField = valueObj?.contentType;
  const contentTypeValue = typeof contentTypeField === 'string' ? contentTypeField : null;

  // Rendered inline and filtered out of the entries below.
  const constraints = (() => {
    if (!schemaRecord) return null;
    const c: { maxLength?: number; minLength?: number; maximum?: number; minimum?: number } = {};
    if (typeof schemaRecord.maxLength === 'number') c.maxLength = schemaRecord.maxLength;
    if (typeof schemaRecord.minLength === 'number') c.minLength = schemaRecord.minLength;
    if (typeof schemaRecord.maximum === 'number') c.maximum = schemaRecord.maximum;
    if (typeof schemaRecord.minimum === 'number') c.minimum = schemaRecord.minimum;
    return Object.keys(c).length > 0 ? c : null;
  })();

  // Rendered as a synthetic [key] entry.
  const additionalProperties = valueObj?.additionalProperties;
  const additionalPropsSchema = additionalProperties && typeof additionalProperties === 'object' ? additionalProperties : null;

  // Array schemas hoist items.properties.
  const isArraySchema = schemaRecord?.type === 'array';

  const rawEntries = isArray ? value.map((v, i) => [i, v] as [number, unknown]) : Object.entries(value);

  // Hide schema keys promoted into labels and hoist array-item properties.
  const filteredEntries =
    openapiMode === 'schema' && !isArray
      ? rawEntries.filter(([key]) => (isInsideProperties || !labelKeys.has(key)) && !(isArraySchema && key === 'items'))
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

  if (additionalPropsSchema) {
    entries.push(['[key]', additionalPropsSchema] as [string, unknown]);
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
  const hasNestedObjects = openapiMode === 'schema' && !isArray ? entries.some(([, val]) => isRecord(val)) : true;

  if (isEmpty) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <KeyRenderer {...keyProps} />
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
    isArray && singleLineArrays && value.every((item) => item === null || (typeof item !== 'object' && typeof item !== 'undefined'));

  if (isPrimitiveArray) {
    return (
      <div {...rowProps} className="whitespace-nowrap">
        <KeyRenderer {...keyProps} />
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

  const isExpandable = hasNestedObjects;

  // Items nodes keep their header so the array item structure stays visible.
  const hideExpandHeader = isFlattenedNode || isRootInSchemaMode;

  return (
    <div>
      {!hideExpandHeader && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the whole row toggles for the mouse; the chevron button inside is the keyboard path.
        <div
          {...rowProps}
          className={cn(
            'group/node -mx-1 -my-px inline-flex items-center gap-0.5 rounded px-1 py-px',
            isExpandable ? 'cursor-pointer hover:bg-accent/50' : 'pointer-events-none',
          )}
          onClick={
            isExpandable
              ? () => {
                  if (!isExpanded && expandChildrenDepth > 1) {
                    setChildCascadeDepth(expandChildrenDepth - 1);
                  } else {
                    setChildCascadeDepth(0);
                  }
                  setIsExpanded(!isExpanded);
                }
              : undefined
          }
        >
          {isExpandable ? (
            // No handler of its own: its click bubbles to the row, so Enter and Space toggle the node as a mouse click does.
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={i18n.t(isExpanded ? 'c:collapse' : 'c:expand')}
              className="focus-effect inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-60 focus-visible:opacity-100"
            >
              <ChevronRightIcon className={cn('size-3.5 transition-transform', isExpanded ? 'rotate-90' : 'rotate-0')} />
            </button>
          ) : (
            <span className="-ml-3.5 inline-flex size-4 shrink-0 items-center justify-center opacity-0">
              <ChevronRightIcon className="size-3.5" />
            </span>
          )}
          <KeyRenderer {...keyProps} />
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
            <CollapsedPreview
              itemCount={schemaPropertiesCount}
              closeBracket={closeBracket}
              hiddenMatchCount={hiddenMatchCount}
              typeLabel={typeLabel}
            />
          )}
          {enableClipboard && <CopyButton value={value} />}
        </div>
      )}
      {(isExpanded || hideExpandHeader || !isExpandable) && (
        <div>
          {entries.map(([key, val]) => (
            <JsonNode
              key={String(key)}
              value={val}
              path={[...path, key]}
              keyName={key}
              depth={depth + 1}
              visualDepth={hideExpandHeader ? effectiveVisualDepth : effectiveVisualDepth + 1}
              cascadeDepth={childCascadeDepth > 0 ? childCascadeDepth - 1 : cascadeDepth > 0 ? cascadeDepth - 1 : 0}
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
  if (prev.cascadeDepth !== next.cascadeDepth) return false;
  // Compare path arrays by value so a new reference does not re-render.
  if (prev.path.length !== next.path.length) return false;
  for (let i = 0; i < prev.path.length; i++) {
    if (prev.path[i] !== next.path[i]) return false;
  }
  return true;
}

export const JsonNode = memo(JsonNodeBase, jsonNodeEqual);
