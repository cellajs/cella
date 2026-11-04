import { useState } from 'react';
import { foldText } from 'shared/utils/text-match';
import { JsonViewerContext, type JsonViewerContextValue, useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { JsonNode } from '~/modules/common/json-viewer/json-node';
import type { DataType, DataTypeProps, JsonViewerProps } from '~/modules/common/json-viewer/types';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';

const emptyValueTypes: DataType[] = [];

/** "#/components/schemas/UserSchema" becomes ["components", "schemas", "UserSchema"]. */
function parseRefPath(refPath: string): string[] {
  if (!refPath.startsWith('#/')) return [];
  return refPath.slice(2).split('/');
}

function RefButton({ value }: DataTypeProps<string>) {
  const { setTargetPath } = useJsonViewerContext();
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setTargetPath(parseRefPath(value));
      }}
      className="link-decoration active:link-decoration-strong text-primary cursor-pointer text-left text-sm wrap-anywhere hover:underline"
    >
      "{value}"
    </button>
  );
}

/** Spec mode: a `$ref` value, a button that expands the path it names. */
const refDataType: DataType<string> = {
  is: (value, path) => path[path.length - 1] === '$ref' && typeof value === 'string' && value.startsWith('#/'),
  Component: RefButton,
};

function ExtendsRef({ value }: DataTypeProps<string>) {
  const { renderRef } = useJsonViewerContext();
  return renderRef?.(value);
}

/** Schema mode: an `extendsRef` value, which names the schema this one extends. */
const extendsRefDataType: DataType<string> = {
  is: (value, path) => path[path.length - 1] === 'extendsRef' && typeof value === 'string',
  Component: ExtendsRef,
};

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
  renderRef,
  renderDescription,
}: JsonViewerProps) {
  const maxStringLength = collapseStringsAfterLength === false ? Number.MAX_VALUE : collapseStringsAfterLength;

  const [targetPath, setTargetPath] = useState<string[] | null>(null);

  const modeDataType = openapiMode === 'spec' ? refDataType : openapiMode === 'schema' && renderRef ? extendsRefDataType : null;
  const combinedValueTypes = modeDataType ? [modeDataType, ...valueTypes] : valueTypes;

  const contextValue: JsonViewerContextValue = {
    indentWidth,
    defaultInspectDepth,
    enableClipboard,
    valueTypes: combinedValueTypes,
    collapseStringsAfterLength: maxStringLength,
    targetPath,
    setTargetPath,
    searchMatchPath,
    searchText,
    expandAll,
    showKeyQuotes,
    hideDescriptions,
    openapiMode,
    renderRef,
    renderDescription,
  };

  return (
    <JsonViewerContext.Provider value={contextValue}>
      <MatchScope terms={searchText ? [foldText(searchText)] : []}>
        <div data-openapi-mode={openapiMode} className="group/json-viewer text-foreground font-mono text-sm leading-normal">
          <JsonNode value={value} path={[]} keyName={rootName} depth={0} />
        </div>
      </MatchScope>
    </JsonViewerContext.Provider>
  );
}
