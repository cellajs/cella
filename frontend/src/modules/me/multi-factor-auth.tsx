import { ShieldMinus } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import HelpText from '~/modules/common/help-text';
import { toaster } from '~/modules/common/toaster/service';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const MultiFactorAuthentication = () => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const { hasPasskey, hasTotp } = useUserStore.getState();
  const { create: createDialog, remove: removeDialog } = useDialoger();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { mutateAsync: updateSelf, isPending } = useUpdateSelfMutation();

  const closeDialog = () => removeDialog('disable-mfa');

  const toggleMFA = (multiFactorRequired: boolean) => {
    updateSelf(
      { multiFactorRequired: true },
      {
        onSuccess: () => {
          toaster(t(`mfa_${multiFactorRequired ? 'enabled' : 'disabled'}`), 'info');
          closeDialog();
        },
      },
    );
  };

  const handleToggleMFA = (multiFactorRequired: boolean) => {
    if (multiFactorRequired) toggleMFA(true);
    else {
      createDialog(
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton variant="destructive" onClick={() => toggleMFA(false)} aria-label="Delete" loading={isPending}>
            <ShieldMinus size={16} className="mr-2" />
            {t('common:disable')}
          </SubmitButton>
          <Button type="reset" variant="secondary" aria-label="Cancel" onClick={closeDialog}>
            {t('common:cancel')}
          </Button>
        </div>,
        {
          id: 'disable-mfa',
          triggerRef,
          className: 'max-w-xl',
          title: t('common:mfa_disable_confirmation.title'),
          description: t('common:mfa_disable_confirmation.text'),
        },
      );
    }
  };
  return (
    <>
      <HelpText content={t('common:mfa.text')}>
        <p className="font-semibold">{t('common:mfa')}</p>
      </HelpText>
      <div className="mb-6">
        {/* TODO make open dialog with TOPT or Passkey creation if none available */}
        <Switch ref={triggerRef} disabled={!hasPasskey || !hasTotp} checked={user.multiFactorRequired} onCheckedChange={handleToggleMFA} />
        {(!hasPasskey || !hasTotp) && <p className="text-sm text-gray-500 mt-2">{t('common:mfa_disabled.text')}</p>}
      </div>
    </>
  );
};
