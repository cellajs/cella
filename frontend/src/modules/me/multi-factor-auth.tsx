import { zodResolver } from '@hookform/resolvers/zod';
import { useSuspenseQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Fingerprint, ShieldMinus, Smartphone } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import z from 'zod';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import { TotpCodeForm } from '~/modules/auth/totp-strategy';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import HelpText from '~/modules/common/help-text';
import { meAuthQueryOptions, useToogleMFAMutation } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

export const MultiFactorAuthentication = () => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const { hasPasskey, hasTotp } = useUserStore.getState();
  const { create: createDialog, remove: removeDialog } = useDialoger();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { mutateAsync: toggleMFA, isPending } = useToogleMFAMutation();

  const onPasskyConfirm = async () => {
    const passkeyData = await getPasskeyVerifyCredential({ email: user.email, type: 'authentication' });
    toggleMFA({ multiFactorRequired: false, passkeyData });
    removeDialog();
  };

  const openTOTPVerify = () => {
    useDialoger.getState().create(
      <TotpVerificationDialog
        onSubmit={(totpCode: string) => {
          toggleMFA({ multiFactorRequired: false, totpCode });
          removeDialog();
        }}
      />,
      {
        id: 'mfa-verification',
        triggerRef,
        className: 'sm:max-w-md p-6',
        title: t('common:totp_verify'),
        drawerOnMobile: false,
        hideClose: false,
      },
    );
  };

  const {
    data: { sessions },
  } = useSuspenseQuery(meAuthQueryOptions());

  const handleDisable = useCallback(() => {
    const currentSession = sessions.find((s) => s.isCurrent);

    if (!currentSession || currentSession.type !== 'mfa' || (currentSession.authStrategy !== 'passkey' && currentSession.authStrategy !== 'totp')) {
      return;
    }

    // Convert session time from UTC to local time
    const sessionTime = dayjs.utc(currentSession.createdAt).local();
    const oneHourAgo = dayjs().subtract(1, 'hour');

    if (sessionTime.isAfter(oneHourAgo)) {
      toggleMFA({ multiFactorRequired: false });
    } else {
      createDialog(
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => onPasskyConfirm()} variant="plain" className="w-full gap-1.5 truncate">
            <Fingerprint size={16} />
            <span className="truncate">
              {t('common:confirm')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
            </span>
          </Button>
          <Button ref={triggerRef} type="button" onClick={openTOTPVerify} variant="plain" className="w-full gap-1.5 truncate">
            <Smartphone size={16} />
            <span className="truncate">
              {t('common:confirm')} {t('common:with').toLowerCase()} {t('common:authenticator_app').toLowerCase()}
            </span>
          </Button>
        </div>,
        {
          id: 'confirmation-disable-mfa',
          triggerRef,
          className: 'max-w-xl',
          title: t('common:mfa_disable_confirmation.title'),
          description: t('common:mfa_disable_confirmation.text'),
        },
      );
    }
  }, [sessions]);

  const handleToggleMFA = (enabled: boolean) => {
    if (enabled) toggleMFA({ multiFactorRequired: true });
    else {
      createDialog(
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton variant="destructive" onClick={handleDisable} aria-label="Delete" loading={isPending}>
            <ShieldMinus size={16} className="mr-2" />
            {t('common:disable')}
          </SubmitButton>
          <Button type="reset" variant="secondary" aria-label="Cancel" onClick={() => removeDialog()}>
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

export const TotpVerificationDialog = ({ onSubmit }: { onSubmit: (code: string) => void }) => {
  const { t } = useTranslation();

  const form = useForm<{ code: string }>({
    resolver: zodResolver(z.object({ code: z.string() })),
    defaultValues: { code: '' },
  });

  const { isValid, isDirty } = useFormState({ control: form.control });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(({ code }) => onSubmit(code), defaultOnInvalid)} className="flex flex-col gap-4 items-center">
        <TotpCodeForm control={form.control} name="code" />

        <div className="flex flex-row gap-2">
          <SubmitButton size="sm" variant="darkSuccess" disabled={!isValid} loading={false}>
            {t('common:confirm')}
          </SubmitButton>

          <Button size="sm" type="reset" variant="secondary" disabled={!isDirty} onClick={() => form.reset()}>
            {t('common:clear')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
