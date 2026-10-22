import type { ComponentType } from 'react';
import type { JsonPath } from '~/modules/common/json-viewer/utils';

export interface DataTypeProps<T = unknown> {
  value: T;
  path: JsonPath;
}

// biome-ignore lint/suspicious/noExplicitAny: Allows DataType<string> etc to be used in valueTypes array
export interface DataType<T = any> {
  is: (value: unknown, path: JsonPath) => boolean;
  Component: ComponentType<DataTypeProps<T>>;
}

/** @public */
// biome-ignore lint/suspicious/noExplicitAny: Allows typed DataType definitions
export const defineDataType = <T = any>(config: DataType<T>): DataType<T> => config;

export interface JsonViewerProps {
  value: unknown;
  /** Levels expanded on first render (default: 3) */
  defaultInspectDepth?: number;
  /** Key shown for the root (default: 'root'); false hides it */
  rootName?: string | false;
  /** A copy button on each object and array row (default: false) */
  enableClipboard?: boolean;
  /** Indent width in characters (default: 2) */
  indentWidth?: number;
  /** Custom renderers; the first whose `is` matches renders the value */
  valueTypes?: DataType[];
  /** Collapse strings after this length (default: 200, false to disable) */
  collapseStringsAfterLength?: number | false;
  /** OpenAPI mode: 'spec' enables $ref navigation, 'schema' hides required arrays and shows labels */
  openapiMode?: 'spec' | 'schema';
  /** Search text to highlight in keys and values */
  searchText?: string;
  /** When true, expand all nodes regardless of defaultInspectDepth */
  expandAll?: boolean;
  /** The current search match (one of `matchRowPaths`); nodes along it expand and its row scrolls into view */
  searchMatchPath?: JsonPath | null;
  /** Whether to show quotes around keys (default: true) */
  showKeyQuotes?: boolean;
}
