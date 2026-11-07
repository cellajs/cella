import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useRedeemHeldLinkMutation } from '~/modules/auth/query';
import { Button } from '~/modules/ui/button';

/** Where an invitation or verification link leads: only a click here redeems it, so a mail scanner that fetched it used up nothing. */
export function ConfirmLinkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { kind } = useParams({ from: '/_public/auth/confirm-link/$kind' });

  const { mutate: redeem, isPending } = useRedeemHeldLinkMutation();

  const onConfirm = () =>
    redeem(kind, {
      onError: (error) => {
        const tokenId = typeof error.tokenId === 'string' ? error.tokenId : undefined;
        navigate({ to: '/auth/error', search: { error: error.type, severity: error.severity, tokenId }, replace: true });
      },
    });

  const header =
    kind === 'invitation'
      ? { title: t('c:confirm_invitation_link'), description: t('c:confirm_invitation_link.text') }
      : { title: t('c:confirm_verification_link'), description: t('c:confirm_verification_link.text') };

  return (
    <>
      <AuthHeader {...header} />
      <Button size="block" loading={isPending} onClick={onConfirm}>
        {t('c:continue')}
        <ArrowRightIcon />
      </Button>
    </>
  );
}
