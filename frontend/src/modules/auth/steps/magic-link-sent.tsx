import { ArrowLeftIcon, MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { SuccessCheckmark } from '~/modules/common/success-checkmark';
import { Button } from '~/modules/ui/button';

export function MagicLinkSentStep() {
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
            <MailIcon strokeWidth={1} className="size-30 text-foreground" />
            <SuccessCheckmark className="absolute top-[60px] left-1/2 ml-4" />
          </div>
        }
        title={t('c:magic_link_check_email')}
      >
        <p>{t(isSignup ? 'c:magic_link_check_email.signup.text' : 'c:magic_link_check_email.text', { email })}</p>
      </AuthHeader>
      {!isSignup && (
        <div className="mt-2 flex flex-col gap-2">
          <Button type="button" variant="plain" onClick={resetAuthStore}>
            <ArrowLeftIcon />
            {t('c:try_another_way')}
          </Button>
        </div>
      )}
    </>
  );
}
