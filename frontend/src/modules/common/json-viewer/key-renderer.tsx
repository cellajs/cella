import type { FC } from 'react';

interface KeyRendererProps {
  keyName?: string | number | false;
  showKeyQuotes: boolean;
  searchText: string;
  isObjectValue: boolean;
  hasSelfRequired: boolean;
  openapiMode?: 'spec' | 'schema';
  theme: {
    key: string;
    index: string;
    required: string;
    searchMatch: string;
  };
}

/**
 * Renders a JSON key with search highlighting and required label.
 * Handles both numeric indices (for arrays) and string keys (for objects).
 */
export const KeyRenderer: FC<KeyRendererProps> = ({
  keyName,
  showKeyQuotes,
  searchText,
  isObjectValue,
  hasSelfRequired,
  openapiMode,
  theme,
}) => {
  if (keyName === false || keyName === undefined) return null;

  const keyStr = String(keyName);
  const isMatch = searchText && keyStr.toLowerCase().includes(searchText.toLowerCase());

  // Show required label if node has required: true on itself
  const requiredLabel = hasSelfRequired && (
    <span className={`ml-1.5 px-1 py-0.5 text-[10px] font-medium rounded ${theme.required}`}>required</span>
  );

  // Numeric index (array items)
  if (typeof keyName === 'number') {
    return <span className={theme.index}>{keyName}</span>;
  }

  // String key (object properties)
  return (
    <>
      <span
        className={`font-medium ${theme.key} ${isMatch ? theme.searchMatch : ''} ${openapiMode === 'schema' && !isObjectValue ? 'text-foreground/40!' : ''}`}
      >
        {showKeyQuotes ? `"${keyName}"` : keyName}
      </span>
      {requiredLabel}
    </>
  );
};
