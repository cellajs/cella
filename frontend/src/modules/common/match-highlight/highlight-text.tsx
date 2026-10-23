import '~/modules/common/match-highlight/match-highlight.css';
import type { ReactNode } from 'react';
import { findMatchRanges } from 'shared/utils/text-match';
import { useMatchScope } from '~/modules/common/match-highlight/match-scope';

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
