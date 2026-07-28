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
export function KeyRenderer({
  keyName,
  showKeyQuotes,
  searchText,
  isObjectValue,
  hasSelfRequired,
  openapiMode,
  theme,
}: KeyRendererProps) {
  if (keyName === false || keyName === undefined) return null;

  const keyStr = String(keyName);
  const isMatch = searchText && keyStr.toLowerCase().includes(searchText.toLowerCase());

  // Dictionary-style key from additionalProperties (e.g., [key])
  const isDictionaryKey = openapiMode === 'schema' && keyStr.startsWith('[') && keyStr.endsWith(']');

  const requiredLabel = hasSelfRequired && (
    <span className={`ml-1.5 rounded px-1 py-0.5 font-medium text-xs ${theme.required}`}>required</span>
  );

  // Numeric index (array items)
  if (typeof keyName === 'number') {
    return <span className={theme.index}>{keyName}</span>;
  }

  // String key (object properties)
  return (
    <>
      <span
        className={`font-medium ${theme.key} ${isMatch ? theme.searchMatch : ''} ${isDictionaryKey ? 'text-foreground/40! italic' : openapiMode === 'schema' && !isObjectValue ? 'text-foreground/40!' : ''}`}
        data-search-match={isMatch ? 'true' : undefined}
      >
        {showKeyQuotes && !isDictionaryKey ? `"${keyName}"` : keyName}
      </span>
      {requiredLabel}
    </>
  );
}
