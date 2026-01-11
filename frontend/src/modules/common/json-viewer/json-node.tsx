import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import { useJsonViewerContext } from './context';
import type { Path } from './types';

/**
 * Recursively checks if a value or any of its children contain the search text.
 */
const containsSearchMatch = (value: unknown, searchText: string): boolean => {
  if (!searchText) return false;
  const lowerSearch = searchText.toLowerCase();

  // Check primitive values
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.toLowerCase().includes(lowerSearch);
  if (typeof value === 'number') return String(value).includes(searchText);
  if (typeof value === 'boolean') return String(value).toLowerCase().includes(lowerSearch);

  // Check arrays
  if (Array.isArray(value)) {
    return value.some((item) => containsSearchMatch(item, searchText));
  }

  // Check objects (including keys)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, val]) => key.toLowerCase().includes(lowerSearch) || containsSearchMatch(val, searchText),
    );
  }

  return false;
};

/**
 * Renders a primitive value inline for single-line arrays.
 */
const InlinePrimitiveValue: FC<{
  value: unknown;
  theme: { string: string; number: string; boolean: string; null: string; searchMatch: string };
  searchText: string;
}> = ({ value, theme, searchText }) => {
  const lowerSearch = searchText?.toLowerCase() || '';

  const renderWithHighlight = (text: string, colorClass: string, quote = false) => {
    if (!lowerSearch) {
      return (
        <span className={colorClass}>
          {quote && '"'}
          {text}
          {quote && '"'}
        </span>
      );
    }

    const lowerText = text.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerSearch);

    if (matchIndex === -1) {
      return (
        <span className={colorClass}>
          {quote && '"'}
          {text}
          {quote && '"'}
        </span>
      );
    }

    const before = text.slice(0, matchIndex);
    const match = text.slice(matchIndex, matchIndex + lowerSearch.length);
    const after = text.slice(matchIndex + lowerSearch.length);

    return (
      <span className={colorClass}>
        {quote && '"'}
        {before}
        <span className={theme.searchMatch}>{match}</span>
        {after}
        {quote && '"'}
      </span>
    );
  };

  if (value === null) return <span className={theme.null}>null</span>;
  if (typeof value === 'boolean') return renderWithHighlight(String(value), theme.boolean);
  if (typeof value === 'number') return renderWithHighlight(String(value), theme.number);
  if (typeof value === 'string') return renderWithHighlight(value, theme.string, true);

  return <span>{String(value)}</span>;
};

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
  const [copied, setCopied] = useState(false);
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

  // Copy to clipboard handler
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Check if current value is an object/array (for key dimming)
  const isObjectValue = valueType === 'object' || valueType === 'array';

  // In schema mode, check if this node itself has required: true (boolean property on the object)
  const hasSelfRequired =
    openapiMode === 'schema' &&
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).required === true;

  // Key rendering helper with search highlight and required label
  const renderKey = () => {
    if (keyName === false) return null;
    const keyStr = String(keyName);
    const isMatch = searchText && keyStr.toLowerCase().includes(searchText.toLowerCase());

    // Show required label if node has required: true on itself
    const requiredLabel = hasSelfRequired && (
      <span className={`ml-1.5 px-1 py-0.5 text-[10px] font-medium rounded ${theme.required}`}>required</span>
    );

    return typeof keyName === 'number' ? (
      <span className={theme.index}>{keyName}</span>
    ) : (
      <>
        <span
          className={`font-medium ${theme.key} ${isMatch ? theme.searchMatch : ''} ${openapiMode === 'schema' && !isObjectValue ? 'opacity-60' : ''}`}
        >
          {showKeyQuotes ? `"${keyName}"` : keyName}
        </span>
        {requiredLabel}
      </>
    );
  };

  // Primitive values
  if (valueType !== 'object' && valueType !== 'array') {
    return (
      <div className="whitespace-nowrap" style={{ paddingLeft }}>
        {renderKey()}
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

  // In schema mode, extract entries and filter out 'required' key
  const rawEntries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
    : Object.entries(value as Record<string, unknown>);

  // Filter out 'required' key in schema mode (it will be shown as label instead)
  const filteredEntries =
    openapiMode === 'schema' && !isArray ? rawEntries.filter(([key]) => key !== 'required') : rawEntries;

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
        {renderKey()}
        {keyName !== false && <span className="opacity-70 mr-1">: </span>}
        <span className={`font-medium ${theme.bracket}`}>
          {openBracket}
          {closeBracket}
        </span>
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
        {renderKey()}
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
  const hasHiddenMatches = !isExpanded && searchText && containsSearchMatch(value, searchText);

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
        {renderKey()}
        {keyName !== false && <span className="opacity-70 mr-1">: </span>}
        <span className={`font-medium ${theme.bracket}`}>{openBracket}</span>
        {!isExpanded && (
          <>
            <span className="opacity-50 italic mx-1 text-xs">
              {isArray ? `${entries.length} items` : `${entries.length} keys`}
            </span>
            <span className={`font-medium ${theme.bracket}`}>{closeBracket}</span>
            {hasHiddenMatches && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${theme.matchBadge}`}
                title="Contains search matches - click to expand"
              >
                match
              </span>
            )}
            {displayDataTypes && <span className="text-[10px] opacity-50 ml-2">{getTypeLabel(value, valueType)}</span>}
          </>
        )}
        {enableClipboard && (
          <button
            type="button"
            className={`inline-flex items-center justify-center bg-transparent border-none cursor-pointer p-0.5 ml-1 rounded transition-opacity hover:bg-black/10 dark:hover:bg-white/10 ${isHovered ? 'opacity-60 hover:opacity-100' : 'opacity-0'}`}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </button>
        )}
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

function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Returns a formatted type label for display (e.g., "int", "float", "Array(5)", "Object") */
function getTypeLabel(value: unknown, type: string): string {
  switch (type) {
    case 'number': {
      const num = value as number;
      if (Number.isNaN(num)) return 'NaN';
      if (!Number.isFinite(num)) return 'Infinity';
      return Number.isInteger(num) ? 'int' : 'float';
    }
    case 'array':
      return `Array(${(value as unknown[]).length})`;
    case 'object':
      return 'Object';
    case 'string':
      return 'string';
    case 'boolean':
      return 'bool';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    default:
      return type;
  }
}

interface PrimitiveValueProps {
  value: unknown;
  type: string;
  theme: {
    string: string;
    number: string;
    boolean: string;
    null: string;
    schemaType: string;
    searchMatch: string;
  };
  collapseStringsAfterLength: number;
  searchText: string;
  openapiMode?: 'spec' | 'schema';
}

/** JSON Schema data type keywords */
const JSON_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

/** Highlights search matches in text with Tailwind classes */
const highlightText = (text: string, searchText: string, colorClass: string, searchMatchClass: string) => {
  if (!searchText) return <span className={colorClass}>{text}</span>;

  const lowerText = text.toLowerCase();
  const lowerSearch = searchText.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index === -1) return <span className={colorClass}>{text}</span>;

  return (
    <span className={colorClass}>
      {text.slice(0, index)}
      <span className={searchMatchClass}>{text.slice(index, index + searchText.length)}</span>
      {text.slice(index + searchText.length)}
    </span>
  );
};

const PrimitiveValue: FC<PrimitiveValueProps> = ({
  value,
  type,
  theme,
  collapseStringsAfterLength,
  searchText,
  openapiMode,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const baseClass = 'break-all whitespace-pre-wrap';

  switch (type) {
    case 'string': {
      const str = String(value);

      // In schema mode, render JSON Schema type keywords without quotes and in type color
      if (openapiMode === 'schema' && JSON_SCHEMA_TYPES.has(str)) {
        // Use appropriate color based on the type keyword
        const typeClass =
          str === 'string'
            ? theme.string
            : str === 'number' || str === 'integer'
              ? theme.number
              : str === 'boolean'
                ? theme.boolean
                : str === 'null'
                  ? theme.null
                  : 'text-purple-600 dark:text-purple-400'; // for array/object
        return <span className={`${baseClass} ${theme.schemaType} ${typeClass}`}>{str}</span>;
      }

      const shouldTruncate = str.length > collapseStringsAfterLength;
      const displayValue = !isExpanded && shouldTruncate ? str.slice(0, collapseStringsAfterLength) : str;
      const isMatch = searchText && str.toLowerCase().includes(searchText.toLowerCase());

      return (
        <span
          className={`${baseClass} max-w-[600px] inline-block align-top ${shouldTruncate ? 'cursor-pointer' : ''}`}
          onClick={shouldTruncate ? () => setIsExpanded(!isExpanded) : undefined}
          title={shouldTruncate ? (isExpanded ? 'Click to collapse' : 'Click to expand') : undefined}
        >
          "
          {isMatch ? (
            highlightText(displayValue, searchText, theme.string, theme.searchMatch)
          ) : (
            <span className={theme.string}>{displayValue}</span>
          )}
          {!isExpanded && shouldTruncate && <span className="opacity-50">…</span>}"
        </span>
      );
    }
    case 'number': {
      const numStr = String(value);
      const isMatch = searchText && numStr.includes(searchText);
      return (
        <span className={baseClass}>
          {isMatch ? (
            highlightText(numStr, searchText, theme.number, theme.searchMatch)
          ) : (
            <span className={theme.number}>{numStr}</span>
          )}
        </span>
      );
    }
    case 'boolean': {
      const boolStr = String(value);
      const isMatch = searchText && boolStr.toLowerCase().includes(searchText.toLowerCase());
      return (
        <span className={baseClass}>
          {isMatch ? (
            highlightText(boolStr, searchText, theme.boolean, theme.searchMatch)
          ) : (
            <span className={theme.boolean}>{boolStr}</span>
          )}
        </span>
      );
    }
    case 'null':
      return <span className={`${baseClass} ${theme.null}`}>null</span>;
    case 'undefined':
      return <span className={`${baseClass} ${theme.null}`}>undefined</span>;
    default:
      return <span className={baseClass}>{String(value)}</span>;
  }
};
