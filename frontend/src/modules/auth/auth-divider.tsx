import { useTranslation } from 'react-i18next';
import { isStrategyEnabled } from 'shared';

/** The "or" between the address form and the institution and provider buttons; nothing when neither strategy is enabled. */
export function AuthDivider() {
  const { t } = useTranslation();

  if (!isStrategyEnabled('oauth') && !isStrategyEnabled('sso')) return null;

  return <div className="text-center text-muted-foreground text-xs">{t('c:or')}</div>;
}
