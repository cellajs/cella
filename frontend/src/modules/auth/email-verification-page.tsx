import { useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { LegalNotice } from '~/modules/auth/legal-notice';

export function EmailVerificationPage() {
  const { t } = useTranslation();

  const { reason } = useParams({ from: '/_public/auth/email-verification/$reason' });
  const { provider } = useSearch({ from: '/_public/auth/email-verification/$reason' });

  const reasonText = t(`c:request_verification.${reason}` as TKey, { providerName: provider });

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('c:almost_there')}</h1>
      <p className="my-4">{t('c:request_verification.text', { reason: reasonText })}</p>

      {reason === 'signup' && <LegalNotice mode="verify" />}
    </div>
  );
}
