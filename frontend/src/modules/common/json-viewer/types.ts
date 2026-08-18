import type { ComponentType } from 'react';

/** Path to a value in the JSON tree */
export type Path = (string | number)[];

export interface DataTypeProps<T = unknown> {
  value: T;
  path: Path;
}

// biome-ignore lint/suspicious/noExplicitAny: Allows DataType<string> etc to be used in valueTypes array
export interface DataType<T = any> {
  is: (value: unknown, path: Path) => boolean;
  Component: ComponentType<DataTypeProps<T>>;
}

// biome-ignore lint/suspicious/noExplicitAny: Allows typed DataType definitions
export const defineDataType = <T = any>(config: DataType<T>): DataType<T> => config;

export interface JsonViewerProps<T = unknown> {
  value: T;
  defaultInspectDepth?: number;
  /** Root name to display (false to hide) */
  rootName?: string | false;
  displayDataTypes?: boolean;
  enableClipboard?: boolean;
  /** Indent width in characters (default: 2) */
  indentWidth?: number;
  valueTypes?: DataType[];
  className?: string;
  /** Collapse strings after this length (default: 50, false to disable) */
  collapseStringsAfterLength?: number | false;
  /** OpenAPI mode: 'spec' enables $ref navigation, 'schema' hides required arrays and shows labels */
  openapiMode?: 'spec' | 'schema';
  /** Search text to filter/highlight matching nodes */
  searchText?: string;
  /** When true, expand all nodes regardless of defaultInspectDepth */
  expandAll?: boolean;
  /** Current match index for navigation (0-based) */
  currentMatchIndex?: number;
  /** Path to the current search match; nodes along it expand */
  searchMatchPath?: (string | number)[] | null;
  /** Whether to show quotes around keys (default: true) */
  showKeyQuotes?: boolean;
  /** How many levels deep to expand when clicking a node (default: 1) */
  expandChildrenDepth?: number;
}

/** Tailwind class mappings for JsonViewer theming */
export interface JsonViewerTheme {
  // Value type colors
  string: string;
  number: string;
  boolean: string;
  null: string;
  // Structure colors
  key: string;
  bracket: string;
  // Array index styling
  index: string;
  // Schema mode specific
  schemaType: string;
  required: string;
  // Search highlight
  searchMatch: string;
  matchBadge: string;
}

export const defaultTheme: JsonViewerTheme = {
  string: 'text-foreground',
  number: 'text-amber-700 dark:text-amber-400',
  boolean: 'text-rose-600 dark:text-rose-400',
  null: 'text-gray-500 dark:text-gray-500',
  key: 'text-emerald-700 dark:text-emerald-400',
  bracket: 'text-gray-700 dark:text-gray-300',
  index: 'text-gray-500 opacity-70 text-xs',
  schemaType: 'font-medium italic',
  required: 'bg-amber-100/50 dark:bg-amber-900/10 text-amber-700/60 dark:text-amber-200/60',
  searchMatch: 'bg-yellow-200 dark:bg-yellow-700 rounded px-0.5',
  matchBadge: 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200',
};
