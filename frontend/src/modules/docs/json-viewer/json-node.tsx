import { ChevronRightIcon } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import { CollapsedPreview } from './collapsed-preview';
import { useJsonViewerContext } from './context';
import { CopyButton } from './copy-button';
import { KeyRenderer } from './key-renderer';
import { InlinePrimitiveValue, PrimitiveValue } from './primitive-value';
import { SchemaLabels } from './schema-labels';
import type { Path } from './types';
import { countSearchMatchesInValue, getTypeLabel, getValueType } from './utils';

interface JsonNodeProps {
  value: unknown;
  path: Path;
  keyName?: string | number | false;
  depth: number;
  /** Visual depth for indentation (doesn't increment for flattened nodes) */
  visualDepth?: number;
  /** How many more levels to auto-expand (passed down when parent expands with cascade) */
  cascadeDepth?: number;
}

/**
 * Renders a single node in the JSON tree.
 */
export const JsonNode: FC<JsonNodeProps> = ({ value, path, keyName, depth, visualDepth, cascadeDepth = 0 }) => {
  // Use visualDepth if provided, otherwise fall back to depth
  const effectiveVisualDepth = visualDepth ?? depth;

  const {
    theme,
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

  // In schema mode, arrays of primitives render on a single line
  const singleLineArrays = openapiMode === 'schema';

  // Track current cascade depth for children (when user clicks to expand)
  const [childCascadeDepth, setChildCascadeDepth] = useState(0);

  // In schema mode, check if this is a node that should be flattened (always expanded, no key shown)
  const isPropertiesNode = openapiMode === 'schema' && keyName === 'properties';
  const isCompositionNode = openapiMode === 'schema' && (keyName === 'anyOf' || keyName === 'oneOf');
  const isFlattenedNode = isPropertiesNode || isCompositionNode;

  // In schema mode, hide the root expand (depth 0) - content is always visible
  const isRootInSchemaMode = openapiMode === 'schema' && depth === 0;

  // Determine if this node should be expanded by default
  const getDefaultExpanded = () => {
    // Flattened nodes (properties, anyOf, oneOf) and root in schema mode are always expanded
    if (isFlattenedNode || isRootInSchemaMode) return true;
    if (cascadeDepth > 0) return true; // Auto-expand if cascading from parent
    if (expandAll) return true;
    return depth < defaultInspectDepth;
  };

  const [isExpanded, setIsExpanded] = useState(getDefaultExpanded);

  // Check if this node is on the path to the target (for $ref navigation)
  const isOnTargetPath = (() => {
    if (!targetPath || targetPath.length === 0) return false;
    if (path.length > targetPath.length) return false;
    return path.every((p, i) => String(p) === targetPath[i]);
  })();

  // Check if this node is on the path to the current search match
  const isOnSearchMatchPath = (() => {
    if (!searchMatchPath || searchMatchPath.length === 0) return false;
    if (path.length > searchMatchPath.length) return false;
    return path.every((p, i) => String(p) === String(searchMatchPath[i]));
  })();

  // Expand when expandAll changes to true, or when on target path
  useEffect(() => {
    if (expandAll && !isExpanded) {
      setIsExpanded(true);
    }
  }, [expandAll]);

  // Expand this node when it's on the target path (without collapsing others)
  useEffect(() => {
    if (isOnTargetPath && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isOnTargetPath, targetPath]);

  // Expand this node when it's on the search match path
  useEffect(() => {
    if (isOnSearchMatchPath && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isOnSearchMatchPath, searchMatchPath]);

  const paddingLeft = effectiveVisualDepth * indentWidth * 8;

  // Check for custom data types first
  for (const dataType of valueTypes) {
    if (dataType.is(value, path)) {
      const CustomComponent = dataType.Component;
      return (
        <div className="whitespace-nowrap" style={{ paddingLeft }}>
          {keyName !== false &&
            (typeof keyName === 'number' ? (
              <span className={theme.index}>{keyName}</span>
            ) : (
              <span className={`font-medium ${theme.key}`}>{showKeyQuotes ? `"${keyName}"` : keyName}</span>
            ))}
          {keyName !== false && <span className="opacity-70 mr-1">:</span>}
          <CustomComponent value={value} path={path} />
        </div>
      );
    }
  }

  // Handle different value types
  const valueType = getValueType(value);

  // Check if current value is an object/array (for key dimming)
  const isObjectValue = valueType === 'object';

  // In schema mode, check if this node itself has required: true (boolean property on the object)
  const hasSelfRequired =
    openapiMode === 'schema' &&
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).required === true;

  // Common props for KeyRenderer
  const keyProps = {
    keyName,
    showKeyQuotes,
    searchText,
    isObjectValue,
    hasSelfRequired,
    openapiMode,
    theme,
  };

  // Primitive values
  if (valueType !== 'object' && valueType !== 'array') {
    return (
      <div className="whitespace-nowrap" style={{ paddingLeft }}>
        <KeyRenderer {...keyProps} />
        {keyName !== false && <span className="opacity-70 mr-1">:</span>}
        <PrimitiveValue
          value={value}
          type={valueType}
          theme={theme}
          collapseStringsAfterLength={collapseStringsAfterLength}
          searchText={searchText}
          openapiMode={openapiMode}
        />
        {displayDataTypes && <span className="text-sm opacity-50 ml-2">{getTypeLabel(value, valueType)}</span>}
      </div>
    );
  }

  // Object or Array
  const isArray = valueType === 'array';

  // In schema mode, check if parent key is 'properties' (type keys inside properties should NOT be filtered)
  const parentKey = path.length > 0 ? path[path.length - 1] : null;
  const isInsideProperties = parentKey === 'properties';

  // Get 'type' value if present and we should show it as a label (not inside 'properties')
  // Type can be a string (e.g., "string") or an array (e.g., ["string", "null"] for nullable)
  const typeValue = (() => {
    if (!openapiMode || openapiMode !== 'schema' || isArray || isInsideProperties) return null;
    if (typeof value !== 'object' || value === null) return null;
    const typeField = (value as Record<string, unknown>).type;
    if (typeof typeField === 'string') return typeField;
    if (Array.isArray(typeField) && typeField.every((t) => typeof t === 'string')) {
      return typeField as string[];
    }
    return null;
  })();

  // Check if we can extract schema labels (type, anyOf, oneOf, ref) from this value
  const canExtractLabels =
    openapiMode === 'schema' && !isArray && !isInsideProperties && typeof value === 'object' && value !== null;
  const valueObj = canExtractLabels ? (value as Record<string, unknown>) : null;

  // Check if this node has 'anyOf' or 'oneOf' (composition type) - will be shown as type label
  const hasAnyOf = valueObj ? Array.isArray(valueObj.anyOf) : false;
  const hasOneOf = valueObj ? Array.isArray(valueObj.oneOf) : false;

  // Get 'ref' value if present and we should show it as a label (not inside 'properties')
  // Extract just the schema name from the full ref path (e.g., '#/components/schemas/User' -> 'User')
  const refValue = (() => {
    if (valueObj && typeof valueObj.ref === 'string') {
      return valueObj.ref.split('/').pop() || valueObj.ref;
    }
    return null;
  })();

  // contentType is displayed as a regular property in the JSON viewer
  const contentTypeValue = null;

  // Check if this is an array schema (has type: 'array') - used to hoist items.properties
  const isArraySchema =
    openapiMode === 'schema' &&
    !isArray &&
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).type === 'array';

  // In schema mode, extract entries and filter out 'required' key
  const rawEntries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
    : Object.entries(value as Record<string, unknown>);

  // Filter out 'required' key in schema mode (it will be shown as label instead)
  // Also filter out 'type' and 'ref' keys when not inside 'properties' (they will be shown as labels after open bracket)
  // For array schemas, filter out 'items' key (its properties will be hoisted)
  // Note: 'anyOf' and 'oneOf' are NOT filtered - they are flattened like 'properties' but still rendered
  const filteredEntries =
    openapiMode === 'schema' && !isArray
      ? rawEntries.filter(
          ([key]) =>
            key !== 'required' &&
            (isInsideProperties || (key !== 'type' && key !== 'ref')) &&
            !(isArraySchema && key === 'items'),
        )
      : rawEntries;

  // For array schemas, hoist items.properties as direct children
  const hoistedItemsEntries = (() => {
    if (!isArraySchema) return [];
    const items = (value as Record<string, unknown>).items;
    if (typeof items === 'object' && items !== null) {
      const itemProps = (items as Record<string, unknown>).properties;
      if (typeof itemProps === 'object' && itemProps !== null) {
        return Object.entries(itemProps);
      }
    }
    return [];
  })();

  // Combine filtered entries with hoisted items properties
  const combinedEntries = [...filteredEntries, ...hoistedItemsEntries];

  // In schema mode, sort entries: primitives first, then objects/arrays
  const entries =
    openapiMode === 'schema' && !isArray
      ? [...combinedEntries].sort(([, a], [, b]) => {
          const aIsObject = a !== null && typeof a === 'object';
          const bIsObject = b !== null && typeof b === 'object';
          if (aIsObject === bIsObject) return 0;
          return aIsObject ? 1 : -1;
        })
      : filteredEntries;

  // In schema mode, compute the count of hoisted properties (what users see as children)
  const schemaPropertiesCount = (() => {
    if (openapiMode !== 'schema' || isArray) return entries.length;
    const obj = value as Record<string, unknown>;
    // For array schemas, count items.properties
    if (isArraySchema) return hoistedItemsEntries.length;
    // For object schemas, count properties
    if (obj.properties && typeof obj.properties === 'object') return Object.keys(obj.properties).length;
    return entries.length;
  })();

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const isEmpty = entries.length === 0;

  // In schema mode, check if this object has any nested objects (not arrays) as children
  // Only objects with nested object children should be expandable
  // Arrays are always expandable, and we check the filtered entries for actual object children
  const hasNestedObjects =
    openapiMode === 'schema' && !isArray
      ? entries.some(([, val]) => val !== null && typeof val === 'object' && !Array.isArray(val))
      : true; // Non-schema mode or arrays: always expandable

  // In schema mode, brackets are hidden via Tailwind group-data selector
  const bracketClass = `font-medium ${theme.bracket} group-data-[openapi-mode=schema]/jv:hidden`;

  if (isEmpty) {
    return (
      <div className="whitespace-nowrap" style={{ paddingLeft }}>
        <KeyRenderer {...keyProps} />
        {keyName !== false && <span className="opacity-70 mr-1">:</span>}
        <span className={bracketClass}>{openBracket}</span>
        <SchemaLabels
          typeValue={typeValue}
          refValue={refValue}
          contentTypeValue={contentTypeValue}
          hasAnyOf={hasAnyOf}
          hasOneOf={hasOneOf}
          theme={theme}
        />
        <span className={bracketClass}>{closeBracket}</span>
      </div>
    );
  }

  // Check if array should be rendered on a single line (only primitives, no objects/arrays)
  const isPrimitiveArray =
    isArray &&
    singleLineArrays &&
    (value as unknown[]).every((item) => item === null || (typeof item !== 'object' && typeof item !== 'undefined'));

  // Render single-line primitive array
  if (isPrimitiveArray) {
    const items = value as unknown[];
    return (
      <div className="whitespace-nowrap" style={{ paddingLeft }}>
        <KeyRenderer {...keyProps} />
        {keyName !== false && <span className="opacity-70 mr-1">:</span>}
        <span className={bracketClass}>[</span>
        {items.map((item, index) => (
          <span key={index}>
            <InlinePrimitiveValue value={item} theme={theme} searchText={searchText} />
            {index < items.length - 1 && <span className="opacity-70">, </span>}
          </span>
        ))}
        <span className={bracketClass}>]</span>
      </div>
    );
  }

  // Count search matches in collapsed node (to show indicator with count)
  const hiddenMatchCount = !isExpanded && !!searchText ? countSearchMatchesInValue(value, searchText) : 0;

  // In schema mode, objects without nested object children are not expandable
  const isExpandable = hasNestedObjects;

  // Should hide the expand header (for flattened nodes or root in schema mode)
  // Note: items nodes remain visible (unlike properties) to show the array item structure
  const hideExpandHeader = isFlattenedNode || isRootInSchemaMode;

  return (
    <div data-properties-node={isFlattenedNode || undefined}>
      {!hideExpandHeader && (
        <div
          className={`group/node inline-flex items-center gap-0.5 rounded py-px px-1 -my-px -mx-1 ${isExpandable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5' : 'pointer-events-none'}`}
          style={{ paddingLeft }}
          onClick={
            isExpandable
              ? () => {
                  if (!isExpanded && expandChildrenDepth > 1) {
                    // When expanding, cascade to children
                    setChildCascadeDepth(expandChildrenDepth - 1);
                  } else {
                    // When collapsing, reset cascade
                    setChildCascadeDepth(0);
                  }
                  setIsExpanded(!isExpanded);
                }
              : undefined
          }
        >
          <span
            className={`inline-flex items-center justify-center w-4 h-4 shrink-0 ${isExpandable ? 'opacity-60' : 'opacity-0 -ml-3.5'}`}
          >
            <ChevronRightIcon size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : 'rotate-0'}`} />
          </span>
          <KeyRenderer {...keyProps} />
          {keyName !== false && <span className="opacity-70 mr-1">:</span>}
          <span className={bracketClass}>{openBracket}</span>
          <SchemaLabels
            typeValue={typeValue}
            refValue={refValue}
            contentTypeValue={contentTypeValue}
            hasAnyOf={hasAnyOf}
            hasOneOf={hasOneOf}
            theme={theme}
          />
          {!isExpanded && isExpandable && (
            <CollapsedPreview
              itemCount={schemaPropertiesCount}
              closeBracket={closeBracket}
              hiddenMatchCount={hiddenMatchCount}
              displayDataTypes={displayDataTypes}
              typeLabel={getTypeLabel(value, valueType)}
              theme={theme}
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
              <span className={bracketClass}>{closeBracket}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
