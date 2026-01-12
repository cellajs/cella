import { type FC, useCallback, useMemo, useRef, useState } from 'react';
import { JsonViewerContext, type JsonViewerContextValue } from './context';
import { JsonNode } from './json-node';
import type { DataType, JsonViewerProps } from './types';
import { defaultTheme } from './types';

/**
 * Parses a $ref path into an array of keys.
 * e.g., "#/components/schemas/UserSchema" -> ["components", "schemas", "UserSchema"]
 */
const parseRefPath = (refPath: string): string[] => {
  if (!refPath.startsWith('#/')) return [];
  return refPath.slice(2).split('/');
};

/**
 * Scrolls to the target schema and highlights it for 3 seconds.
 */
const scrollToRef = (containerRef: React.RefObject<HTMLDivElement | null>, refPath: string) => {
  if (!containerRef.current) return;

  const schemaName = refPath.split('/').pop() || refPath;

  requestAnimationFrame(() => {
    setTimeout(() => {
      if (!containerRef.current) return;

      const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT, null);

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text === `"${schemaName}"` || text === schemaName) {
          const parentEl = node.parentElement;
          if (parentEl) {
            parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add highlight class, then remove after 3 seconds
            parentEl.classList.add('json-ref-highlight');
            setTimeout(() => {
              parentEl.classList.remove('json-ref-highlight');
            }, 3000);
            return;
          }
        }
      }
    }, 150);
  });
};

/**
 * Creates a custom data type for OpenAPI $ref values.
 */
const createRefDataType = (onNavigate: (targetPath: string) => void): DataType<string> => ({
  is: (value, path) => {
    const lastKey = path[path.length - 1];
    return lastKey === '$ref' && typeof value === 'string' && value.startsWith('#/');
  },
  Component: ({ value }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onNavigate(value);
      }}
      className="text-primary hover:underline cursor-pointer font-mono text-sm"
      title={`Go to ${value}`}
    >
      "{value}"
    </button>
  ),
});

/**
 * A lightweight JSON viewer component with collapsible nodes.
 * Supports OpenAPI spec mode with $ref navigation and mode for schema viewing.
 */
export const JsonViewer: FC<JsonViewerProps> = ({
  value,
  defaultInspectDepth = 3,
  rootName = 'root',
  displayDataTypes = false,
  enableClipboard = false,
  indentWidth = 2,
  valueTypes = [],
  className,
  collapseStringsAfterLength = 200,
  openapiMode,
  searchText = '',
  expandAll = false,
  currentMatchIndex = 0,
  searchMatchPath = null,
  showKeyQuotes = true,
  expandChildrenDepth = 1,
}) => {
  const maxStringLength = collapseStringsAfterLength === false ? Number.MAX_VALUE : collapseStringsAfterLength;
  const containerRef = useRef<HTMLDivElement>(null);

  // OpenAPI mode: track target path for $ref navigation (nodes along this path will expand)
  const [targetPath, setTargetPath] = useState<string[] | null>(null);

  // Handle $ref navigation in openapi mode
  const handleRefNavigate = useCallback((refPath: string) => {
    const pathParts = parseRefPath(refPath);
    setTargetPath(pathParts);

    setTimeout(() => {
      scrollToRef(containerRef, refPath);
    }, 200);
  }, []);

  // OpenAPI spec mode: create $ref data type
  const refDataType = useMemo(
    () => (openapiMode === 'spec' ? createRefDataType(handleRefNavigate) : null),
    [openapiMode, handleRefNavigate],
  );

  // Combine valueTypes with refDataType for openapi mode
  const combinedValueTypes = useMemo(() => {
    if (refDataType) {
      return [refDataType, ...valueTypes];
    }
    return valueTypes;
  }, [refDataType, valueTypes]);

  const contextValue: JsonViewerContextValue = {
    theme: defaultTheme,
    indentWidth,
    defaultInspectDepth,
    displayDataTypes,
    enableClipboard,
    valueTypes: combinedValueTypes,
    collapseStringsAfterLength: maxStringLength,
    targetPath,
    searchMatchPath,
    searchText,
    expandAll,
    currentMatchIndex,
    showKeyQuotes,
    expandChildrenDepth,
    openapiMode,
  };

  return (
    <JsonViewerContext.Provider value={contextValue}>
      {/* Scoped highlight styles */}
      <style>
        {`
          .json-ref-highlight {
            background-color: rgb(251 191 36) !important;
            border-radius: 4px;
            box-shadow: 0 0 0 2px rgb(251 191 36);
            animation: json-highlight-fade 3s ease-out forwards;
          }
          @keyframes json-highlight-fade {
            0%, 70% { background-color: rgb(251 191 36); box-shadow: 0 0 0 2px rgb(251 191 36); }
            100% { background-color: transparent; box-shadow: none; }
          }
          .json-current-match {
            outline: 2px solid rgb(59 130 246) !important;
            outline-offset: 2px;
            border-radius: 2px;
          }
        `}
      </style>
      <div
        ref={containerRef}
        data-openapi-mode={openapiMode}
        className={`group/jv font-mono leading-relaxed text-gray-900 dark:text-gray-100 ${className || ''}`}
      >
        <JsonNode value={value} path={[]} keyName={rootName} depth={0} />
      </div>
    </JsonViewerContext.Provider>
  );
};
