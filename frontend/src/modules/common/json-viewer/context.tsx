import { createContext, useContext } from 'react';
import type { DataType, JsonViewerTheme } from './types';
import { defaultTheme } from './types';
import type { JsonPath } from './utils';

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
  /** The current search match: nodes along it expand, the row at its end scrolls into view */
  searchMatchPath: JsonPath | null;
  searchText: string;
  expandAll: boolean;
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
  showKeyQuotes: true,
  expandChildrenDepth: 1,
  openapiMode: undefined,
});

export const useJsonViewerContext = () => useContext(JsonViewerContext);
