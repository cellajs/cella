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
  /** Target path for $ref navigation - nodes along this path will expand */
  targetPath: string[] | null;
  /** Search text to filter/highlight matching nodes */
  searchText: string;
  /** When true, expand all nodes */
  expandAll: boolean;
  /** Current match index for navigation */
  currentMatchIndex: number;
  /** Whether to show quotes around keys */
  showKeyQuotes: boolean;
  /** How many levels deep to expand when clicking a node */
  expandChildrenDepth: number;
  /** OpenAPI mode: 'spec' or 'schema' */
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
  searchText: '',
  expandAll: false,
  currentMatchIndex: 0,
  showKeyQuotes: true,
  expandChildrenDepth: 1,
  openapiMode: undefined,
});

export const useJsonViewerContext = () => useContext(JsonViewerContext);
