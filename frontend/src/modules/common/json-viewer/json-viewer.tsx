import { useMemo, useState } from 'react';
import { foldText } from 'shared/utils/text-match';
import { JsonViewerContext, type JsonViewerContextValue } from '~/modules/common/json-viewer/context';
import { JsonNode } from '~/modules/common/json-viewer/json-node';
import type { DataType, JsonViewerProps } from '~/modules/common/json-viewer/types';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';

const emptyValueTypes: DataType[] = [];

/** "#/components/schemas/UserSchema" becomes ["components", "schemas", "UserSchema"]. */
function parseRefPath(refPath: string): string[] {
  if (!refPath.startsWith('#/')) return [];
  return refPath.slice(2).split('/');
}

function createRefDataType(onNavigate: (targetPath: string[]) => void): DataType<string> {
  return {
    is: (value, path) => {
      const lastKey = path[path.length - 1];
      return lastKey === '$ref' && typeof value === 'string' && value.startsWith('#/');
    },
    Component: ({ value }) => (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onNavigate(parseRefPath(value));
        }}
        className="link-decoration active:link-decoration-strong cursor-pointer text-primary text-sm hover:underline"
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
  enableClipboard = false,
  indentWidth = 2,
  valueTypes = emptyValueTypes,
  collapseStringsAfterLength = 200,
  openapiMode,
  searchText = '',
  expandAll = false,
  searchMatchPath = null,
  showKeyQuotes = true,
  hideDescriptions = false,
}: JsonViewerProps) {
  const maxStringLength = collapseStringsAfterLength === false ? Number.MAX_VALUE : collapseStringsAfterLength;

  const [targetPath, setTargetPath] = useState<string[] | null>(null);

  // Memoized: each call creates a new Component, which would remount every $ref button
  const refDataType = useMemo(() => (openapiMode === 'spec' ? createRefDataType(setTargetPath) : null), [openapiMode]);
  const combinedValueTypes = refDataType ? [refDataType, ...valueTypes] : valueTypes;

  const contextValue: JsonViewerContextValue = {
    indentWidth,
    defaultInspectDepth,
    enableClipboard,
    valueTypes: combinedValueTypes,
    collapseStringsAfterLength: maxStringLength,
    targetPath,
    searchMatchPath,
    searchText,
    expandAll,
    showKeyQuotes,
    hideDescriptions,
    openapiMode,
  };

  return (
    <JsonViewerContext.Provider value={contextValue}>
      <MatchScope terms={searchText ? [foldText(searchText)] : []}>
        <div data-openapi-mode={openapiMode} className="group/json-viewer font-mono text-foreground text-sm leading-normal">
          <JsonNode value={value} path={[]} keyName={rootName} depth={0} />
        </div>
      </MatchScope>
    </JsonViewerContext.Provider>
  );
}
