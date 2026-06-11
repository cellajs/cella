import { useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LegalNotice } from '~/modules/auth/legal-notice';

export function EmailVerificationPage() {
  const { t } = useTranslation();

  const { reason } = useParams({ from: '/_public/auth/email-verification/$reason' });
  const { provider } = useSearch({ from: '/_public/auth/email-verification/$reason' });

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('c:almost_there')}</h1>
      <p className="my-4">
        {t('c:request_verification.text', {
          reason: t(`c:request_verification.${reason}`, { providerName: provider }),
        })}
      </p>

      {reason === 'signup' && <LegalNotice mode="verify" />}
    </div>
  );
}
