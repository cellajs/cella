import '~/modules/common/match-highlight/match-highlight.css';
import type { ReactNode } from 'react';
import { findMatchRanges } from 'shared/utils/text-match';
import { useMatchScope } from '~/modules/common/match-highlight/match-scope';
import { cn } from '~/utils/cn';

interface HighlightTextProps {
  text: string;
}

/** `text` with the scope's terms wrapped in `<mark>`; an ancestor with `data-match-current` turns them into the current match. */
export function HighlightText({ text }: HighlightTextProps): ReactNode {
  const terms = useMatchScope();
  const ranges = findMatchRanges(text, terms);
  if (!ranges.length) return text;

  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} data-match="">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

interface MatchReasonProps {
  /** Searched text a narrow screen leaves out, such as the email beside a name: its column starts at `md`. */
  text: string | null | undefined;
  /** The text the cell shows; while it holds a match itself, the reason stays hidden. */
  shownText: string;
  className?: string;
}

/** Below `md`, a muted line with a match the screen leaves out of view, so a row found by its hidden column shows why. */
export function MatchReason({ text, shownText, className }: MatchReasonProps) {
  const terms = useMatchScope();
  if (!text || !findMatchRanges(text, terms).length || findMatchRanges(shownText, terms).length) return null;

  return (
    <span className={cn('block truncate text-muted-foreground text-xs md:hidden', className)}>
      <HighlightText text={text} />
    </span>
  );
}
