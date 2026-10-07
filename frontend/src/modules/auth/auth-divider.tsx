import { useTranslation } from 'react-i18next';
import { isStrategyEnabled } from 'shared';

/** The "or" between the address form and the institution and provider buttons; nothing when neither strategy is enabled. */
export function AuthDivider() {
  const { t } = useTranslation();

  if (!isStrategyEnabled('oauth') && !isStrategyEnabled('sso')) return null;

  return (
    <div className="relative flex justify-center text-xs uppercase">
      <span className="px-2 text-muted-foreground">{t('c:or')}</span>
    </div>
  );
}
