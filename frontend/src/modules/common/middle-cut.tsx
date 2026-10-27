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
  const endStart = Math.max(text.length - keptEndLength, Math.ceil(text.length / 2));
  const boundary = Math.max(text.lastIndexOf(' ', endStart) + 1, text.lastIndexOf('@', endStart));
  const splitAt = boundary > 0 && text.length - boundary <= maxKeptEndLength ? boundary : endStart;

  return (
    <span className={cn('inline-flex min-w-0 max-w-full', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="overflow-hidden text-ellipsis whitespace-pre">
        {text.slice(0, splitAt)}
      </span>
      <span aria-hidden className="whitespace-pre">
        {text.slice(splitAt)}
      </span>
    </span>
  );
}
