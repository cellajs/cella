interface CollapsedPreviewProps {
  itemCount: number;
  closeBracket: string;
  hiddenMatchCount: number;
  displayDataTypes: boolean;
  typeLabel: string;
  theme: {
    bracket: string;
    matchBadge: string;
  };
}

export function CollapsedPreview({
  itemCount,
  closeBracket,
  hiddenMatchCount,
  displayDataTypes,
  typeLabel,
  theme,
}: CollapsedPreviewProps) {
  return (
    <>
      <span className="mx-1.5 whitespace-nowrap text-xs italic opacity-50">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>
      <span className={`font-medium ${theme.bracket} group-data-[openapi-mode=schema]/jv:hidden`}>{closeBracket}</span>
      {hiddenMatchCount > 0 && (
        <span
          className={`ml-1.5 rounded px-1.5 py-0.5 font-medium text-sm ${theme.matchBadge}`}
          title="Contains search matches - click to expand"
        >
          {hiddenMatchCount} {hiddenMatchCount === 1 ? 'match' : 'matches'}
        </span>
      )}
      {displayDataTypes && <span className="ml-2 text-sm opacity-50">{typeLabel}</span>}
    </>
  );
}
