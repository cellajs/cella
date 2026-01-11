import { type FC, useState } from 'react';
import { highlightText, JSON_SCHEMA_TYPES } from './utils';

interface InlinePrimitiveValueProps {
  value: unknown;
  theme: { string: string; number: string; boolean: string; null: string; searchMatch: string };
  searchText: string;
}

/**
 * Renders a primitive value inline for single-line arrays.
 */
export const InlinePrimitiveValue: FC<InlinePrimitiveValueProps> = ({ value, theme, searchText }) => {
  const lowerSearch = searchText?.toLowerCase() || '';

  const renderWithHighlight = (text: string, colorClass: string, quote = false) => {
    const quoteSpan = quote ? <span className="group-data-[openapi-mode=schema]/jv:hidden">"</span> : null;

    if (!lowerSearch) {
      return (
        <span className={colorClass}>
          {quoteSpan}
          {text}
          {quoteSpan}
        </span>
      );
    }

    const lowerText = text.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerSearch);

    if (matchIndex === -1) {
      return (
        <span className={colorClass}>
          {quoteSpan}
          {text}
          {quoteSpan}
        </span>
      );
    }

    const before = text.slice(0, matchIndex);
    const match = text.slice(matchIndex, matchIndex + lowerSearch.length);
    const after = text.slice(matchIndex + lowerSearch.length);

    return (
      <span className={colorClass}>
        {quoteSpan}
        {before}
        <span className={theme.searchMatch}>{match}</span>
        {after}
        {quoteSpan}
      </span>
    );
  };

  if (value === null) return <span className={theme.null}>null</span>;
  if (typeof value === 'boolean') return renderWithHighlight(String(value), theme.boolean);
  if (typeof value === 'number') return renderWithHighlight(String(value), theme.number);
  if (typeof value === 'string') return renderWithHighlight(value, theme.string, true);

  return <span>{String(value)}</span>;
};

interface PrimitiveValueProps {
  value: unknown;
  type: string;
  theme: {
    string: string;
    number: string;
    boolean: string;
    null: string;
    schemaType: string;
    searchMatch: string;
  };
  collapseStringsAfterLength: number;
  searchText: string;
  openapiMode?: 'spec' | 'schema';
}

/**
 * Renders a primitive value with full formatting, search highlighting, and truncation.
 */
export const PrimitiveValue: FC<PrimitiveValueProps> = ({
  value,
  type,
  theme,
  collapseStringsAfterLength,
  searchText,
  openapiMode,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const baseClass = 'break-all whitespace-pre-wrap';

  switch (type) {
    case 'string': {
      const str = String(value);

      // In schema mode, render JSON Schema type keywords without quotes and in type color
      if (openapiMode === 'schema' && JSON_SCHEMA_TYPES.has(str)) {
        // Use appropriate color based on the type keyword
        const typeClass =
          str === 'string'
            ? theme.string
            : str === 'number' || str === 'integer'
              ? theme.number
              : str === 'boolean'
                ? theme.boolean
                : str === 'null'
                  ? theme.null
                  : 'text-purple-600 dark:text-purple-400'; // for array/object
        return <span className={`${baseClass} ${theme.schemaType} ${typeClass}`}>{str}</span>;
      }

      const shouldTruncate = str.length > collapseStringsAfterLength;
      const displayValue = !isExpanded && shouldTruncate ? str.slice(0, collapseStringsAfterLength) : str;
      const isMatch = searchText && str.toLowerCase().includes(searchText.toLowerCase());

      return (
        <span
          className={`${baseClass} max-w-[600px] inline-block align-top ${shouldTruncate ? 'cursor-pointer' : ''}`}
          onClick={shouldTruncate ? () => setIsExpanded(!isExpanded) : undefined}
          title={shouldTruncate ? (isExpanded ? 'Click to collapse' : 'Click to expand') : undefined}
        >
          <span className="group-data-[openapi-mode=schema]/jv:hidden">"</span>
          {isMatch ? (
            highlightText(displayValue, searchText, theme.string, theme.searchMatch)
          ) : (
            <span className={theme.string}>{displayValue}</span>
          )}
          {!isExpanded && shouldTruncate && <span className="opacity-50">…</span>}
          <span className="group-data-[openapi-mode=schema]/jv:hidden">"</span>
        </span>
      );
    }
    case 'number': {
      const numStr = String(value);
      const isMatch = searchText && numStr.includes(searchText);
      return (
        <span className={baseClass}>
          {isMatch ? (
            highlightText(numStr, searchText, theme.number, theme.searchMatch)
          ) : (
            <span className={theme.number}>{numStr}</span>
          )}
        </span>
      );
    }
    case 'boolean': {
      const boolStr = String(value);
      const isMatch = searchText && boolStr.toLowerCase().includes(searchText.toLowerCase());
      return (
        <span className={baseClass}>
          {isMatch ? (
            highlightText(boolStr, searchText, theme.boolean, theme.searchMatch)
          ) : (
            <span className={theme.boolean}>{boolStr}</span>
          )}
        </span>
      );
    }
    case 'null':
      return <span className={`${baseClass} ${theme.null}`}>null</span>;
    case 'undefined':
      return <span className={`${baseClass} ${theme.null}`}>undefined</span>;
    default:
      return <span className={baseClass}>{String(value)}</span>;
  }
};
