import { useCallback, useMemo, useRef, useState } from 'react';
import { foldText } from 'shared/utils/text-match';
import { MatchScope } from '~/modules/common/match-highlight';
import { cn } from '~/utils/cn';
import { JsonViewerContext, type JsonViewerContextValue } from './context';
import { JsonNode } from './json-node';
import type { DataType, JsonViewerProps } from './types';
import { defaultTheme } from './types';

const emptyValueTypes: DataType[] = [];

/** "#/components/schemas/UserSchema" becomes ["components", "schemas", "UserSchema"]. */
function parseRefPath(refPath: string): string[] {
  if (!refPath.startsWith('#/')) return [];
  return refPath.slice(2).split('/');
}

function scrollToRef(containerRef: React.RefObject<HTMLDivElement | null>, refPath: string) {
  if (!containerRef.current) return;

  const schemaName = refPath.split('/').pop() || refPath;

  requestAnimationFrame(() => {
    setTimeout(() => {
      if (!containerRef.current) return;

      const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT, null);

      let node: Node | null = walker.nextNode();
      while (node) {
        const text = node.textContent?.trim();
        if (text === `"${schemaName}"` || text === schemaName) {
          const parentEl = node.parentElement;
          if (parentEl) {
            parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            parentEl.classList.add('json-ref-highlight');
            setTimeout(() => {
              parentEl.classList.remove('json-ref-highlight');
            }, 3000);
            return;
          }
        }
        node = walker.nextNode();
      }
    }, 150);
  });
}

function createRefDataType(onNavigate: (targetPath: string) => void): DataType<string> {
  return {
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
        className="link-decoration active:link-decoration-strong cursor-pointer font-mono text-primary text-sm hover:underline"
        title={`Go to ${value}`}
      >
        "{value}"
      </button>
    ),
  };
}

export function JsonViewer({
  value,
  defaultInspectDepth = 3,
  rootName = 'root',
  displayDataTypes = false,
  enableClipboard = false,
  indentWidth = 2,
  valueTypes = emptyValueTypes,
  className,
  collapseStringsAfterLength = 200,
  openapiMode,
  searchText = '',
  expandAll = false,
  searchMatchPath = null,
  showKeyQuotes = true,
  expandChildrenDepth = 1,
}: JsonViewerProps) {
  const maxStringLength = collapseStringsAfterLength === false ? Number.MAX_VALUE : collapseStringsAfterLength;
  const containerRef = useRef<HTMLDivElement>(null);

  const [targetPath, setTargetPath] = useState<string[] | null>(null);

  const handleRefNavigate = useCallback((refPath: string) => {
    const pathParts = parseRefPath(refPath);
    setTargetPath(pathParts);

    setTimeout(() => {
      scrollToRef(containerRef, refPath);
    }, 200);
  }, []);

  const refDataType = useMemo(() => (openapiMode === 'spec' ? createRefDataType(handleRefNavigate) : null), [openapiMode, handleRefNavigate]);

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
    showKeyQuotes,
    expandChildrenDepth,
    openapiMode,
  };

  return (
    <JsonViewerContext.Provider value={contextValue}>
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
        `}
      </style>
      <MatchScope terms={searchText ? [foldText(searchText)] : []}>
        <div
          ref={containerRef}
          data-openapi-mode={openapiMode}
          className={cn('group/jv font-mono text-foreground text-sm leading-relaxed', className)}
        >
          <JsonNode value={value} path={[]} keyName={rootName} depth={0} />
        </div>
      </MatchScope>
    </JsonViewerContext.Provider>
  );
}
