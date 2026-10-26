import i18n from 'i18next';
import { Children, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';

// A cut name keeps its end whole: the last 12 characters (a file extension, the domain of an address), from the
// start of their first word while that keeps at most 20 (a surname)
const keptEndLength = 12;
const maxKeptEndLength = 20;

// A confirmation spells out this many names and counts the rest, so a large selection keeps its question short
const maxListedNames = 3;

const strongClass = 'wrap-break-word inline-block max-w-full font-semibold text-foreground';

/** The first three names and a count of the rest, as list parts: "a, b, c, and 37 more". */
function listParts(names: string[]) {
  const listed = names.slice(0, maxListedNames);
  const rest = names.length - listed.length;
  const items = rest > 0 ? [...listed, i18n.t('c:counted_more', { count: rest })] : listed;
  return new Intl.ListFormat(i18n.resolvedLanguage, { type: 'conjunction' }).formatToParts(items);
}

type ListParts = ReturnType<typeof listParts>;

/** A name on one line: when it overflows the line its middle gives way to an ellipsis, so its start and end stay readable. */
function CutName({ text }: { text: string }) {
  const endStart = Math.max(text.length - keptEndLength, Math.ceil(text.length / 2));
  const wordStart = text.lastIndexOf(' ', endStart) + 1;
  const splitAt = wordStart > 0 && text.length - wordStart <= maxKeptEndLength ? wordStart : endStart;
  return (
    // 1ch less than the line leaves room for the mark that ends the sentence, so a "?" never wraps alone
    <strong className="inline-flex max-w-[calc(100%-1ch)] font-semibold text-foreground">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="overflow-hidden text-ellipsis whitespace-pre">
        {text.slice(0, splitAt)}
      </span>
      <span aria-hidden className="whitespace-pre">
        {text.slice(splitAt)}
      </span>
    </strong>
  );
}

interface StrongProps {
  /** The interpolated text of each list value, mapped to its parts. */
  lists: Map<string, ListParts>;
  /** The interpolated `name`, which keeps to one line and is cut in the middle. */
  name?: string;
  children?: ReactNode;
}

/** Marks what the sentence names; a list of names marks each one apart, so the list wraps between names. */
function Strong({ lists, name, children }: StrongProps) {
  const nodes = Children.toArray(children);
  const text = nodes.every((node) => typeof node === 'string') ? nodes.join('') : undefined;
  if (text !== undefined && text === name) return <CutName text={text} />;

  const parts = text === undefined ? undefined : lists.get(text);
  if (!parts) return <strong className={strongClass}>{children}</strong>;

  return parts.map((part, index) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: list parts are positional and never reordered.
    part.type === 'element' ? <CutName key={index} text={part.value} /> : part.value,
  );
}

interface NamedTextProps {
  /** A sentence whose translation wraps what it names in `<strong>`. */
  i18nKey: TKey;
  /** The item or entity the sentence names, interpolated as `{{name}}`. */
  name?: string;
  /** A list of names shows the first three and counts the rest. */
  values?: Record<string, string | number | string[]>;
}

/**
 * A sentence that names what it is about: what a confirmation hits, or the entity a sheet or dialog acts on. The
 * translation marks the name (or an email address, a count of items) with `<strong>`, so it shows in semibold. The
 * `name` and each name of a list stay on one line and are cut in the middle when they overflow it; anything else it
 * marks keeps to one line while it fits one, so an address never splits at its hyphen.
 */
export function NamedText({ i18nKey, name, values = {} }: NamedTextProps) {
  const { t } = useTranslation();

  const lists = new Map<string, ListParts>();
  const interpolated = Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (!Array.isArray(value)) return [key, value];
      const parts = listParts(value);
      const text = parts.map((part) => part.value).join('');
      lists.set(text, parts);
      return [key, text];
    }),
  );
  if (name !== undefined) interpolated.name = name;

  // `as never`: the prop already checks the key, and Trans cannot represent the union of all keys a second time
  return <Trans t={t} i18nKey={i18nKey as never} values={interpolated} components={{ strong: <Strong lists={lists} name={name} /> }} />;
}
