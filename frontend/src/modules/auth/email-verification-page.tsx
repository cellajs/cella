import { useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { AuthHeader } from '~/modules/auth/auth-header';
import { LegalNotice } from '~/modules/auth/legal-notice';

export function EmailVerificationPage() {
  const { t } = useTranslation();

  const { reason } = useParams({ from: '/_public/auth/email-verification/$reason' });
  const { provider } = useSearch({ from: '/_public/auth/email-verification/$reason' });

  const reasonText = t(`c:request_verification.${reason}` as TKey, { providerName: provider });

  return (
    <>
      <AuthHeader title={t('c:almost_there')}>
        <p>{t('c:request_verification.text', { reason: reasonText })}</p>
      </AuthHeader>

      {reason === 'signup' && <LegalNotice mode="verify" />}
    </>
  );
}
