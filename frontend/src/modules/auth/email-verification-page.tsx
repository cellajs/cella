import { useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LegalNotice } from '~/modules/auth/legal-notice';

function EmailVerificationPage() {
  const { t } = useTranslation();

  const { reason } = useParams({ from: '/publicLayout/authLayout/auth/email-verification/$reason' });
  const { provider } = useSearch({ from: '/publicLayout/authLayout/auth/email-verification/$reason' });

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('common:almost_there')}</h1>
      <p className="font-light my-4">
        {t('common:request_verification.text', {
          reason: t(`common:request_verification.${reason}`, { providerName: provider }),
        })}
      </p>

      {reason === 'signup' && <LegalNotice mode="verify" />}
    </div>
  );
};

export default EmailVerificationPage;
