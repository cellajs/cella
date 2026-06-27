import { ArrowLeftIcon, MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '~/modules/auth/auth-store';
import { SuccessCheckmark } from '~/modules/common/success-checkmark';
import { Button } from '~/modules/ui/button';

export function MagicLinkSentStep() {
  const { t } = useTranslation();
  const { email, resetSteps, magicLinkMode } = useAuthStore();

  const isSignup = magicLinkMode === 'signup';

  return (
    <div className="relative flex flex-col gap-4 text-center">
      <SuccessCheckmark className="absolute top-[60px] left-1/2 ml-4" />
      <MailIcon size={120} strokeWidth={1} className="mx-auto text-foreground" />
      <h1 className="text-2xl">{t('c:magic_link_check_email')}</h1>
      <p className="">
        {t(isSignup ? 'c:magic_link_check_email.signup.text' : 'c:magic_link_check_email.text', { email })}
      </p>
      {!isSignup && (
        <div className="mt-2 flex flex-col gap-2">
          <Button type="button" variant="plain" onClick={resetSteps}>
            <ArrowLeftIcon size={16} className="mr-2" />
            {t('c:try_another_way')}
          </Button>
        </div>
      )}
    </div>
  );
}
