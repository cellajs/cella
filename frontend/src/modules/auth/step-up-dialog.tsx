import { useMutation, useQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { FingerprintPatternIcon, LogInIcon, MailIcon, SmartphoneIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getStepUp, type StepUpData, sendStepUpLink, stepUp } from 'sdk';
import { endSession } from '~/modules/auth/end-session';
import { getPasskeyStepUpCredential } from '~/modules/auth/passkey-credentials';
import { StepUpDismissed, type StepUpMethod } from '~/modules/auth/step-up-retry';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

/** The page to come back to after an emailed link or a new sign-in. */
const currentPath = () => window.location.pathname + window.location.search;

interface StepUpDialogProps {
  methods: StepUpMethod[];
  onStepUp: () => void;
}

/** Asks the user to prove it's them: with a passkey or TOTP they hold, else by an emailed link or a new sign-in. */
function StepUpDialog({ methods, onStepUp }: StepUpDialogProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'options' | 'totp' | 'linkSent'>('options');

  const { mutate: proveFactor, isPending: proving } = useMutation({
    mutationFn: (body: StepUpData['body']) => stepUp({ body }),
    onSuccess: onStepUp,
  });

  const withPasskey = async () => {
    try {
      proveFactor({ passkeyData: await getPasskeyStepUpCredential() });
    } catch {
      toaster.error(t('error:passkey_verification_failed'));
    }
  };

  // When this dialog sent its link: the poll is keyed on it, so no dialog reads an answer an earlier one left.
  const [sentAt, setSentAt] = useState<number | null>(null);
  const { mutate: sendLink, isPending: sending } = useMutation({
    mutationFn: () => sendStepUpLink({ body: { redirect: currentPath() } }),
    onSuccess: () => {
      setSentAt(Date.now());
      setView('linkSent');
    },
  });

  // Opening the mailed link in this browser steps this session up; the dialog then carries on by itself.
  const { data: state } = useQuery({
    queryKey: ['auth', 'step-up', sentAt],
    queryFn: () => getStepUp(),
    enabled: sentAt !== null,
    refetchInterval: 3000,
    staleTime: 0,
    gcTime: 0,
    meta: { persist: false },
  });
  useEffect(() => {
    if (sentAt !== null && state?.steppedUp) onStepUp();
  }, [sentAt, state?.steppedUp, onStepUp]);

  const signInAgain = async () => {
    const redirect = currentPath();
    // The same person signs in again, so their local database stays.
    await endSession({ wipe: false }).catch(() => {});
    window.location.assign(`/auth/authenticate?redirect=${encodeURIComponent(redirect)}`);
  };

  if (view === 'totp') {
    return (
      <TotpConfirmationForm
        label={t('c:totp_verify')}
        isPending={proving}
        onSubmit={({ code }) => proveFactor({ totpCode: code })}
        onCancel={() => setView('options')}
      />
    );
  }

  if (view === 'linkSent') {
    return <p className="text-muted-foreground text-sm">{t('c:step_up_link_sent.text')}</p>;
  }

  // An impersonation never steps up: the admin acts as the user, not on how the account is protected.
  if (methods.length === 0) return <p className="text-muted-foreground text-sm">{t('error:impersonation_forbidden.text')}</p>;

  return (
    <div className="flex flex-col gap-2">
      {methods.includes('passkey') && (
        <Button variant="plain" className="w-full gap-1.5" loading={proving} onClick={withPasskey}>
          <FingerprintPatternIcon />
          {t('c:confirm')} {t('c:with').toLowerCase()} {t('c:passkey').toLowerCase()}
        </Button>
      )}
      {methods.includes('totp') && (
        <Button variant="plain" className="w-full gap-1.5" onClick={() => setView('totp')}>
          <SmartphoneIcon />
          {t('c:confirm')} {t('c:with').toLowerCase()} {t('c:authenticator_app').toLowerCase()}
        </Button>
      )}
      {methods.includes('email') && (
        <Button variant="plain" className="w-full gap-1.5" loading={sending} onClick={() => sendLink()}>
          <MailIcon />
          {t('c:step_up_email')}
        </Button>
      )}
      {methods.includes('sign_in') && (
        <Button variant="plain" className="w-full gap-1.5" onClick={signInAgain}>
          <LogInIcon />
          {t('c:sign_in_again')}
        </Button>
      )}
    </div>
  );
}

/** Opens the re-auth dialog; resolves once this session is stepped up, rejects with `StepUpDismissed` when closed. */
export const openStepUpDialog = (methods: StepUpMethod[]) =>
  new Promise<void>((resolve, reject) => {
    let steppedUp = false;
    useDialoger.getState().create(
      <StepUpDialog
        methods={methods}
        onStepUp={() => {
          steppedUp = true;
          useDialoger.getState().remove('step-up');
          resolve();
        }}
      />,
      {
        id: 'step-up',
        triggerRef: { current: null },
        className: 'sm:max-w-md',
        title: i18n.t('c:step_up'),
        description: i18n.t('c:step_up.text'),
        onClose: () => {
          if (!steppedUp) reject(new StepUpDismissed());
        },
      },
    );
  });
