import { createContext, useContext } from 'react';
import type { DataType, JsonViewerTheme } from './types';
import { defaultTheme } from './types';

export interface JsonViewerContextValue {
  theme: JsonViewerTheme;
  indentWidth: number;
  defaultInspectDepth: number;
  displayDataTypes: boolean;
  enableClipboard: boolean;
  valueTypes: DataType[];
  collapseStringsAfterLength: number;
  /** Path from $ref navigation; nodes along it expand */
  targetPath: string[] | null;
  searchMatchPath: (string | number)[] | null;
  searchText: string;
  expandAll: boolean;
  currentMatchIndex: number;
  showKeyQuotes: boolean;
  expandChildrenDepth: number;
  openapiMode?: 'spec' | 'schema';
}

export const JsonViewerContext = createContext<JsonViewerContextValue>({
  theme: defaultTheme,
  indentWidth: 2,
  defaultInspectDepth: 3,
  displayDataTypes: false,
  enableClipboard: false,
  valueTypes: [],
  collapseStringsAfterLength: 50,
  targetPath: null,
  searchMatchPath: null,
  searchText: '',
  expandAll: false,
  currentMatchIndex: 0,
  showKeyQuotes: true,
  expandChildrenDepth: 1,
  openapiMode: undefined,
});

export const useJsonViewerContext = () => useContext(JsonViewerContext);
