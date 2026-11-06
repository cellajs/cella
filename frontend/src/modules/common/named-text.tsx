import type { TFunction } from 'i18next';
import { Children, type ReactNode, use } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { MiddleCut } from '~/modules/common/middle-cut';
import { DrawerLeadContext } from '~/modules/ui/drawer';

// A confirmation spells out this many names and counts the rest, so a large selection keeps its question short
const maxListedNames = 3;

const strongClass = 'wrap-break-word inline-block max-w-full font-semibold text-foreground';

/**
 * The first three names and a count of the rest, as list parts: "a, b, c, and 37 more". `t` and `language` come from the
 * render, so the React Compiler's memo of the list follows a language change; the i18n singleton is invisible to it.
 */
function listParts(names: string[], t: TFunction, language: string | undefined) {
  const listed = names.slice(0, maxListedNames);
  const rest = names.length - listed.length;
  const items = rest > 0 ? [...listed, t('c:counted_more', { count: rest })] : listed;
  return new Intl.ListFormat(language, { type: 'conjunction' }).formatToParts(items);
}

type ListParts = ReturnType<typeof listParts>;

/** A name on one line, cut in the middle when it overflows the line. In a drawer's lead it wraps with the sentence. */
function CutName({ text }: { text: string }) {
  // A box that cannot wrap moves to the next line whole when the words before it leave too little room
  if (use(DrawerLeadContext)) return <strong className="text-foreground font-semibold wrap-break-word">{text}</strong>;

  return (
    <strong className="text-foreground font-semibold">
      {/* 1ch less than the line keeps the sentence's closing "?" on a cut name's line */}
      <MiddleCut text={text} className="max-w-[calc(100%-1ch)]" />
    </strong>
  );
}

interface StrongProps {
  /** Keyed by a list's interpolated text. */
  lists: Map<string, ListParts>;
  /** The interpolated `name`. */
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
  /** Interpolated as `{{name}}`. */
  name?: string;
  /** A list of names shows the first three and counts the rest. */
  values?: Record<string, string | number | string[]>;
}

/**
 * A sentence whose translation marks what it names with `<strong>`. `name` and listed names stay on one line, cut in the
 * middle, except in a drawer's lead, where they wrap; anything else marked keeps to one line while it fits.
 */
export function NamedText({ i18nKey, name, values = {} }: NamedTextProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;

  const lists = new Map<string, ListParts>();
  const interpolated = Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (!Array.isArray(value)) return [key, value];
      const parts = listParts(value, t, language);
      const text = parts.map((part) => part.value).join('');
      lists.set(text, parts);
      return [key, text];
    }),
  );
  if (name !== undefined) interpolated.name = name;

  // `as never`: the prop already checks the key, and Trans cannot represent the union of all keys a second time
  return <Trans t={t} i18nKey={i18nKey as never} values={interpolated} components={{ strong: <Strong lists={lists} name={name} /> }} />;
}
