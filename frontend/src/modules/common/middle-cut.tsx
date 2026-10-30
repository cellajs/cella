import { findMatchRanges } from 'shared/utils/text-match';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { useMatchScope } from '~/modules/common/match-highlight/match-scope';
import { cn } from '~/utils/cn';

// A cut text keeps its end whole: the last 12 characters (a file extension, the domain of an address), from the
// start of their first word or the @ of an address while that keeps at most 20 (a surname, a longer domain)
const keptEndLength = 12;
const maxKeptEndLength = 20;

interface MiddleCutProps {
  text: string;
  className?: string;
}

/** Text on one line: when it overflows, its middle gives way to an ellipsis, so its start and end stay readable. */
export function MiddleCut({ text, className }: MiddleCutProps) {
  const terms = useMatchScope();
  const endStart = Math.max(text.length - keptEndLength, Math.ceil(text.length / 2));
  const boundary = Math.max(text.lastIndexOf(' ', endStart) + 1, text.lastIndexOf('@', endStart));
  const naturalSplit = boundary > 0 && text.length - boundary <= maxKeptEndLength ? boundary : endStart;
  // A search match the cut could hide starts the kept end, while that end stays within twice its usual length
  const [matchStart] = findMatchRanges(text, terms)[0] ?? [];
  const splitAt =
    matchStart !== undefined && matchStart < naturalSplit && text.length - matchStart <= 2 * maxKeptEndLength ? matchStart : naturalSplit;

  return (
    <span className={cn('inline-flex min-w-0 max-w-full', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="overflow-hidden text-ellipsis whitespace-pre">
        <HighlightText text={text.slice(0, splitAt)} />
      </span>
      {/* The start gives way first; an end wider than the whole box is cut at its own end */}
      <span aria-hidden className="max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-pre">
        <HighlightText text={text.slice(splitAt)} />
      </span>
    </span>
  );
}
