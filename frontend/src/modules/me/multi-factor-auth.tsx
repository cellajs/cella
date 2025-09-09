import { useTranslation } from 'react-i18next';
import HelpText from '~/modules/common/help-text';
import { toaster } from '~/modules/common/toaster/service';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const MultiFactorAuthentication = () => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const { hasPasskey, hasTotp } = useUserStore.getState();

  const { mutateAsync: updateSelf } = useUpdateSelfMutation();

  const toggleMFA = (multiFactorRequired: boolean) => {
    updateSelf(
      { multiFactorRequired },
      {
        onSuccess: () => {
          const message = t(`mfa_${multiFactorRequired ? 'enabled' : 'disabled'}`);
          toaster(message, 'info');
        },
      },
    );
  };
  return (
    <>
      <HelpText content={t('common:mfa.text')}>
        <p className="font-semibold">{t('common:mfa')}</p>
      </HelpText>
      <div className="mb-6">
        {/* TODO make open dialog with TOPT or Passkey creation if none available */}
        <Switch disabled={!hasPasskey || !hasTotp} checked={user.multiFactorRequired} onCheckedChange={toggleMFA} />
        {(!hasPasskey || !hasTotp) && <p className="text-sm text-gray-500 mt-2">{t('common:mfa_disabled.text')}</p>}
      </div>
    </>
  );
};
