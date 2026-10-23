import { createContext, useContext } from 'react';
import type { DataType } from '~/modules/common/json-viewer/types';
import type { JsonPath } from '~/modules/common/json-viewer/utils';

export interface JsonViewerContextValue {
  indentWidth: number;
  defaultInspectDepth: number;
  enableClipboard: boolean;
  valueTypes: DataType[];
  collapseStringsAfterLength: number;
  /** Path from $ref navigation; nodes along it expand, the node at its end scrolls into view and flashes */
  targetPath: string[] | null;
  searchMatchPath: JsonPath | null;
  searchText: string;
  expandAll: boolean;
  showKeyQuotes: boolean;
  openapiMode?: 'spec' | 'schema';
}

export const JsonViewerContext = createContext<JsonViewerContextValue | null>(null);

export function useJsonViewerContext() {
  const context = useContext(JsonViewerContext);
  if (!context) throw new Error('useJsonViewerContext must be used within a <JsonViewer />');
  return context;
}
