import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import { CollapsedPreview } from './collapsed-preview';
import { useJsonViewerContext } from './context';
import { CopyButton } from './copy-button';
import { KeyRenderer } from './key-renderer';
import { InlinePrimitiveValue, PrimitiveValue } from './primitive-value';
import { SchemaLabels } from './schema-labels';
import type { Path } from './types';
import { containsSearchMatch, getTypeLabel, getValueType } from './utils';

interface JsonNodeProps {
  value: unknown;
  path: Path;
  keyName?: string | number | false;
  depth: number;
  /** How many more levels to auto-expand (passed down when parent expands with cascade) */
  cascadeDepth?: number;
}

/**
 * Renders a single node in the JSON tree.
 */
export const JsonNode: FC<JsonNodeProps> = ({ value, path, keyName, depth, cascadeDepth = 0 }) => {
  const {
    theme,
    indentWidth,
    defaultInspectDepth,
    defaultInspectControl,
    displayDataTypes,
    enableClipboard,
    valueTypes,
    collapseStringsAfterLength,
    targetPath,
    searchText,
    expandAll,
    showKeyQuotes,
    expandChildrenDepth,
    singleLineArrays,
    openapiMode,
  } = useJsonViewerContext();

  // Track current cascade depth for children (when user clicks to expand)
  const [childCascadeDepth, setChildCascadeDepth] = useState(0);

  // Determine if this node should be expanded by default
  const getDefaultExpanded = () => {
    if (cascadeDepth > 0) return true; // Auto-expand if cascading from parent
    if (expandAll) return true;
    if (defaultInspectControl) {
      return defaultInspectControl(path, value);
    }
    return depth < defaultInspectDepth;
  };

  const [isExpanded, setIsExpanded] = useState(getDefaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  // Check if this node is on the path to the target (for $ref navigation)
  const isOnTargetPath = (() => {
    if (!targetPath || targetPath.length === 0) return false;
    if (path.length > targetPath.length) return false;
    return path.every((p, i) => String(p) === targetPath[i]);
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

  const paddingLeft = depth * indentWidth * 8;

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
          {keyName !== false && <span className="opacity-70 mr-1">: </span>}
          <CustomComponent value={value} path={path} />
        </div>
      );
    }
  }

  // Handle different value types
  const valueType = getValueType(value);

  // Check if current value is an object/array (for key dimming)
  const isObjectValue = valueType === 'object' || valueType === 'array';

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
        {keyName !== false && <span className="opacity-70 mr-1">: </span>}
        <PrimitiveValue
          value={value}
          type={valueType}
          theme={theme}
          collapseStringsAfterLength={collapseStringsAfterLength}
          searchText={searchText}
          openapiMode={openapiMode}
        />
        {displayDataTypes && <span className="text-[10px] opacity-50 ml-2">{getTypeLabel(value, valueType)}</span>}
      </div>
    );
  }

  // Object or Array
  const isArray = valueType === 'array';

  // In schema mode, check if parent key is 'properties' (type keys inside properties should NOT be filtered)
  const parentKey = path.length > 0 ? path[path.length - 1] : null;
  const isInsideProperties = parentKey === 'properties';

  // Get 'type' value if present and we should show it as a label (not inside 'properties')
  const typeValue =
    openapiMode === 'schema' &&
    !isArray &&
    !isInsideProperties &&
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).type === 'string'
      ? ((value as Record<string, unknown>).type as string)
      : null;

  // Get 'ref' value if present and we should show it as a label (not inside 'properties')
  // Extract just the schema name from the full ref path (e.g., '#/components/schemas/User' -> 'User')
  const refValue = (() => {
    if (openapiMode === 'schema' && !isArray && !isInsideProperties && typeof value === 'object' && value !== null) {
      const ref = (value as Record<string, unknown>).ref;
      if (typeof ref === 'string') {
        return ref.split('/').pop() || ref;
      }
    }
    return null;
  })();

  // In schema mode, extract entries and filter out 'required' key
  const rawEntries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
    : Object.entries(value as Record<string, unknown>);

  // Filter out 'required' key in schema mode (it will be shown as label instead)
  // Also filter out 'type' and 'ref' keys when not inside 'properties' (they will be shown as labels after open bracket)
  const filteredEntries =
    openapiMode === 'schema' && !isArray
      ? rawEntries.filter(([key]) => key !== 'required' && (isInsideProperties || (key !== 'type' && key !== 'ref')))
      : rawEntries;

  // In schema mode, sort entries: primitives first, then objects/arrays
  const entries =
    openapiMode === 'schema' && !isArray
      ? [...filteredEntries].sort(([, a], [, b]) => {
          const aIsObject = a !== null && typeof a === 'object';
          const bIsObject = b !== null && typeof b === 'object';
          if (aIsObject === bIsObject) return 0;
          return aIsObject ? 1 : -1;
        })
      : filteredEntries;

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div className="whitespace-nowrap" style={{ paddingLeft }}>
        <KeyRenderer {...keyProps} />
        {keyName !== false && <span className="opacity-70 mr-1">: </span>}
        <span className={`font-medium ${theme.bracket}`}>{openBracket}</span>
        <SchemaLabels typeValue={typeValue} refValue={refValue} theme={theme} />
        <span className={`font-medium ${theme.bracket}`}>{closeBracket}</span>
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
        {keyName !== false && <span className="opacity-70 mr-1">: </span>}
        <span className={`font-medium ${theme.bracket}`}>[</span>
        {items.map((item, index) => (
          <span key={index}>
            <InlinePrimitiveValue value={item} theme={theme} searchText={searchText} />
            {index < items.length - 1 && <span className="opacity-70">, </span>}
          </span>
        ))}
        <span className={`font-medium ${theme.bracket}`}>]</span>
      </div>
    );
  }

  // Check if collapsed node contains search matches (to show indicator)
  const hasHiddenMatches = !isExpanded && !!searchText && containsSearchMatch(value, searchText);

  return (
    <div>
      <div
        className={`inline-flex items-center gap-0.5 rounded py-px px-1 -my-px -mx-1 cursor-pointer ${isHovered ? 'bg-gray-100 dark:bg-white/5' : ''}`}
        style={{ paddingLeft }}
        onClick={() => {
          if (!isExpanded && expandChildrenDepth > 1) {
            // When expanding, cascade to children
            setChildCascadeDepth(expandChildrenDepth - 1);
          } else {
            // When collapsing, reset cascade
            setChildCascadeDepth(0);
          }
          setIsExpanded(!isExpanded);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <span className="inline-flex items-center justify-center w-4 h-4 opacity-60 shrink-0">
          {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </span>
        <KeyRenderer {...keyProps} />
        {keyName !== false && <span className="opacity-70 mr-1">: </span>}
        <span className={`font-medium ${theme.bracket}`}>{openBracket}</span>
        <SchemaLabels typeValue={typeValue} refValue={refValue} theme={theme} />
        {!isExpanded && (
          <CollapsedPreview
            itemCount={entries.length}
            closeBracket={closeBracket}
            hasHiddenMatches={hasHiddenMatches}
            displayDataTypes={displayDataTypes}
            typeLabel={getTypeLabel(value, valueType)}
            theme={theme}
          />
        )}
        {enableClipboard && <CopyButton value={value} isVisible={isHovered} />}
      </div>
      {isExpanded && (
        <>
          {entries.map(([key, val]) => (
            <JsonNode
              key={String(key)}
              value={val}
              path={[...path, key]}
              keyName={key}
              depth={depth + 1}
              cascadeDepth={childCascadeDepth > 0 ? childCascadeDepth - 1 : cascadeDepth > 0 ? cascadeDepth - 1 : 0}
            />
          ))}
          <div style={{ paddingLeft }}>
            <span className={`font-medium ${theme.bracket}`}>{closeBracket}</span>
          </div>
        </>
      )}
    </div>
  );
};
