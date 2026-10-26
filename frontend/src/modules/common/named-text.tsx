import i18n from 'i18next';
import { Children, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { truncateMiddle } from '~/utils/truncate-middle';

// A name this long still fits one line of a sheet description on a phone
const maxNameLength = 40;

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

interface StrongProps {
  /** The interpolated text of each list value, mapped to its parts. */
  lists: Map<string, ListParts>;
  children?: ReactNode;
}

/** Marks what the sentence names; a list of names marks each one apart, so the list wraps between names. */
function Strong({ lists, children }: StrongProps) {
  const nodes = Children.toArray(children);
  const parts = nodes.every((node) => typeof node === 'string') ? lists.get(nodes.join('')) : undefined;
  if (!parts) return <strong className={strongClass}>{children}</strong>;

  return parts.map((part, index) =>
    part.type === 'element' ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: list parts are positional and never reordered.
      <strong key={index} className={strongClass}>
        {part.value}
      </strong>
    ) : (
      part.value
    ),
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
 * translation marks the name (or an email address, a count of items) with `<strong>`, so it shows in semibold, and a
 * `name` longer than 40 characters is cut in the middle. What it marks keeps to one line while it fits one, so an
 * address never splits at its hyphen.
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
  if (name !== undefined) interpolated.name = truncateMiddle(name, maxNameLength);

  // `as never`: the prop already checks the key, and Trans cannot represent the union of all keys a second time
  return <Trans t={t} i18nKey={i18nKey as never} values={interpolated} components={{ strong: <Strong lists={lists} /> }} />;
}
