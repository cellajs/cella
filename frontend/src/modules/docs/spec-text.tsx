import { HighlightText } from '~/modules/common/match-highlight/highlight-text';

/** Prose from the OpenAPI spec: a backtick span renders as code, as on the docs pages, and every part keeps the search highlights. */
export function SpecText({ text }: { text: string }) {
  const parts = text.split('`');
  // An unpaired backtick leaves the text as written
  if (parts.length % 2 === 0) return <HighlightText text={text} />;

  return parts.map((part, index) =>
    index % 2 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
      <code key={index} className="wrap-anywhere rounded-md bg-muted box-decoration-clone px-1.5 py-0.5 font-medium text-[0.875em] text-foreground">
        <HighlightText text={part} />
      </code>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
      <HighlightText key={index} text={part} />
    ),
  );
}
