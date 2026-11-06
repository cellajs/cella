import { useParams } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { Button } from '~/modules/ui/button';

/**
 * The page an invitation or address verification link leads to. The link is used only on a click here, a form post,
 * so a mail scanner that fetched it used up nothing.
 */
export function ConfirmLinkPage() {
  const { t } = useTranslation();
  const { type } = useParams({ from: '/_public/auth/confirm-link/$type' });

  const header =
    type === 'invitation'
      ? { title: t('c:confirm_invitation_link'), description: t('c:confirm_invitation_link.text') }
      : { title: t('c:confirm_verification_link'), description: t('c:confirm_verification_link.text') };

  return (
    <>
      <AuthHeader {...header} />
      <form method="post" action={`${appConfig.backendAuthUrl}/invoke-token/${type}`}>
        <Button type="submit" size="block">
          {t('c:continue')}
          <ArrowRightIcon />
        </Button>
      </form>
    </>
  );
}
