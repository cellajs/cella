import type { FC } from 'react';

/** Path to a value in the JSON tree */
export type Path = (string | number)[];

/** Props for custom data type component */
export interface DataTypeProps<T = unknown> {
  value: T;
  path: Path;
}

/** Custom data type definition */
// biome-ignore lint/suspicious/noExplicitAny: Allows DataType<string> etc to be used in valueTypes array
export interface DataType<T = any> {
  /** Function to check if this type should handle the value */
  is: (value: unknown, path: Path) => boolean;
  /** Component to render the value */
  Component: FC<DataTypeProps<T>>;
}

/** Helper function to define a custom data type */
// biome-ignore lint/suspicious/noExplicitAny: Allows typed DataType definitions
export const defineDataType = <T = any>(config: DataType<T>): DataType<T> => config;

/** JsonViewer component props */
export interface JsonViewerProps<T = unknown> {
  /** The data to display */
  value: T;
  /** Default depth to expand (default: 3) */
  defaultInspectDepth?: number;
  /** Root name to display (false to hide) */
  rootName?: string | false;
  /** Whether to display data type labels */
  displayDataTypes?: boolean;
  /** Whether to enable clipboard copy */
  enableClipboard?: boolean;
  /** Indent width in characters (default: 2) */
  indentWidth?: number;
  /** Custom data types */
  valueTypes?: DataType[];
  /** Additional class name */
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
  /** Path to current search match - nodes along this path will expand */
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

/** Default theme using Tailwind classes with dark mode support */
export const defaultTheme: JsonViewerTheme = {
  // Value types
  string: 'text-foreground',
  number: 'text-amber-700 dark:text-amber-400',
  boolean: 'text-rose-600 dark:text-rose-400',
  null: 'text-gray-500 dark:text-gray-500',
  // Structure
  key: 'text-emerald-700 dark:text-emerald-400',
  bracket: 'text-gray-700 dark:text-gray-300',
  // Array index
  index: 'text-gray-500 opacity-70 text-xs',
  // Schema mode
  schemaType: 'font-medium italic',
  required: 'bg-amber-100/50 dark:bg-amber-900/10 text-amber-700/60 dark:text-amber-200/60',
  // Search
  searchMatch: 'bg-yellow-200 dark:bg-yellow-700 rounded px-0.5',
  matchBadge: 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200',
};
