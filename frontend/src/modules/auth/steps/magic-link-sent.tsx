import { ArrowLeftIcon, InfoIcon, MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { NamedText } from '~/modules/common/named-text';
import { SuccessCheckmark } from '~/modules/common/success-checkmark';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

/** `emailEnabled` comes from the auth health answer: undefined until it arrives, so the dev note waits for a known false. */
export function MagicLinkSentStep({ emailEnabled }: { emailEnabled?: boolean }) {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.email);
  const resetAuthStore = useAuthStore((state) => state.reset);
  const magicLinkMode = useAuthStore((state) => state.magicLinkMode);

  const isSignup = magicLinkMode === 'signup';

  return (
    <>
      <AuthHeader
        image={
          <div className="relative">
            <MailIcon strokeWidth={1} className="size-30" />
            <SuccessCheckmark className="absolute -right-1.5 bottom-2.5" />
          </div>
        }
        title={t('c:magic_link_check_email')}
        description={<NamedText i18nKey={isSignup ? 'c:magic_link_check_email.signup.text' : 'c:magic_link_check_email.text'} values={{ email }} />}
      />
      {appConfig.mode === 'development' && emailEnabled === false && (
        <Alert variant="info" className="mt-2">
          <InfoIcon />
          <AlertTitle>{t('c:dev_only')}</AlertTitle>
          <AlertDescription>{t('c:magic_link_check_email.development.text')}</AlertDescription>
        </Alert>
      )}
      {!isSignup && (
        <Button variant="ghost" onClick={resetAuthStore} className="mt-2 self-center">
          <ArrowLeftIcon />
          {t('c:try_another_way')}
        </Button>
      )}
    </>
  );
}
