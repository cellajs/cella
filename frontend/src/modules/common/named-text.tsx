import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { truncateMiddle } from '~/utils/truncate-middle';

// A name this long still fits one line of a sheet description on a phone
const maxNameLength = 40;

interface NamedTextProps {
  /** A sentence whose translation wraps what it names in `<strong>`. */
  i18nKey: TKey;
  /** The item or entity the sentence names, interpolated as `{{name}}`. */
  name?: string;
  values?: Record<string, string | number>;
}

/**
 * A sentence that names what it is about: what a confirmation hits, or the entity a sheet or dialog acts on. The
 * translation marks the name (or an email address, a count of items) with `<strong>`, so it shows in semibold, and a
 * `name` longer than 40 characters is cut in the middle.
 */
export function NamedText({ i18nKey, name, values }: NamedTextProps) {
  const { t } = useTranslation();

  // `as never`: the prop already checks the key, and Trans cannot represent the union of all keys a second time
  return (
    <Trans
      t={t}
      i18nKey={i18nKey as never}
      values={name === undefined ? values : { ...values, name: truncateMiddle(name, maxNameLength) }}
      components={{ strong: <strong className="font-semibold text-foreground" /> }}
    />
  );
}
