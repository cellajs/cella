import { generateId } from 'shared/utils/entity-id';

/** Inline content of a paragraph: plain text, or a mention of a seeded user. */
type InlineContent =
  | { type: 'text'; text: string; styles: Record<string, never> }
  | { type: 'mention'; props: { id: string; slug: string; name: string } };

/**
 * Block props spelled out in the order the editor serializes them. A seeded document must
 * round-trip unchanged through BlockNote: the editor compares its own serialization with the stored
 * string on load and writes back on any difference, so an omitted default prop, or the same props in
 * another key order, would turn every first open into an update.
 */
const paragraphProps = { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' } as const;

/** One paragraph block with the given inline content. */
export const paragraphBlock = (content: InlineContent[]) => ({
  id: generateId(),
  type: 'paragraph' as const,
  props: paragraphProps,
  content,
  children: [],
});

/** Inline text, the common case. */
export const text = (value: string): InlineContent => ({ type: 'text', text: value, styles: {} });

/** A stored block document (the `description` column) of one paragraph per string. */
export const textDocument = (...paragraphs: string[]): string =>
  JSON.stringify(paragraphs.map((paragraph) => paragraphBlock([text(paragraph)])));

/** A one-paragraph document that mentions `user`, as the composer stores it. */
export const mentionDocument = (user: { id: string; name: string; slug: string }, body: string): string =>
  JSON.stringify([
    paragraphBlock([{ type: 'mention', props: { id: user.id, slug: user.slug, name: user.name } }, text(` ${body}`)]),
  ]);
