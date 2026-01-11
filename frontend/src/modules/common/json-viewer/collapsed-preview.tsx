import type { FC } from 'react';

interface CollapsedPreviewProps {
  itemCount: number;
  closeBracket: string;
  hasHiddenMatches: boolean;
  displayDataTypes: boolean;
  typeLabel: string;
  theme: {
    bracket: string;
    matchBadge: string;
  };
}

/**
 * Renders the preview shown when a node is collapsed.
 * Shows item count, close bracket, match indicator, and optional type label.
 */
export const CollapsedPreview: FC<CollapsedPreviewProps> = ({
  itemCount,
  closeBracket,
  hasHiddenMatches,
  displayDataTypes,
  typeLabel,
  theme,
}) => {
  return (
    <>
      <span className="opacity-50 italic mx-1 text-xs">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>
      <span className={`font-medium ${theme.bracket} group-data-[openapi-mode=schema]/jv:hidden`}>{closeBracket}</span>
      {hasHiddenMatches && (
        <span
          className={`ml-1.5 px-1.5 py-0.5 text-sm font-medium rounded ${theme.matchBadge}`}
          title="Contains search matches - click to expand"
        >
          match
        </span>
      )}
      {displayDataTypes && <span className="text-sm opacity-50 ml-2">{typeLabel}</span>}
    </>
  );
};
