import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';

interface ConfirmTextProps {
  /** A confirmation sentence whose translation wraps its subject in `<strong>`. */
  i18nKey: TKey;
  values?: Record<string, string | number>;
}

/**
 * The sentence of a confirmation, in a popconfirm or as a dialog description. The translation marks what the action
 * hits (an item or page name, an email address, a count of items) with `<strong>`, so every confirmation shows it in bold.
 */
export function ConfirmText({ i18nKey, values }: ConfirmTextProps) {
  const { t } = useTranslation();

  // `as never`: the prop already checks the key, and Trans cannot represent the union of all keys a second time
  return <Trans t={t} i18nKey={i18nKey as never} values={values} components={{ strong: <strong className="font-semibold text-foreground" /> }} />;
}
