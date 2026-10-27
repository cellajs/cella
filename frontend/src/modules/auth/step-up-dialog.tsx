import { useMutation } from '@tanstack/react-query';
import i18n from 'i18next';
import { FingerprintPatternIcon, MailIcon, SmartphoneIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getStepUp, type StepUpData, sendStepUpCode, stepUp } from 'sdk';
import { isStrategyEnabled } from 'shared';
import { getPasskeyStepUpCredential } from '~/modules/auth/passkey-credentials';
import { StepUpDismissedError, type StepUpMethod } from '~/modules/auth/step-up-retry';
import { TotpConfirmationForm } from '~/modules/auth/totp-confirmation-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { NamedText } from '~/modules/common/named-text';
import { toaster } from '~/modules/common/toaster/toaster';
import { useCreatePasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { Skeleton } from '~/modules/ui/skeleton';
import { getCurrentUser } from '~/modules/user/user-store';

const TotpSetup = lazy(() => import('~/modules/me/totp-setup').then((module) => ({ default: module.TotpSetup })));

const dialogId = 'step-up';

type Factor = 'passkey' | 'totp';
type View = 'choose' | 'totp' | 'code' | 'add' | 'totp-setup';

const isFactor = (method: StepUpMethod): method is Factor => method === 'passkey' || method === 'totp';

/** A user without a factor, asked for one, starts at setting one up; everyone else at the ways to confirm. */
const firstView = (methods: StepUpMethod[]): View => (methods.includes('enroll') && !methods.some(isFactor) ? 'add' : 'choose');

/** The dialog's title and description per view; setting up reads as a replacement for a user who holds a factor. */
const headings = (view: View, holdsFactor: boolean) => {
  if (view === 'code') return { title: i18n.t('c:step_up_code'), description: i18n.t('c:step_up_code.text', { email: getCurrentUser().email }) };
  if (view === 'add') {
    return { title: i18n.t('c:step_up_add_factor'), description: i18n.t(holdsFactor ? 'c:step_up_new_factor.text' : 'c:step_up_add_factor.text') };
  }
  if (view === 'totp-setup') return { title: i18n.t('c:totp_qr.title'), description: i18n.t('c:totp_qr.description') };
  return { title: i18n.t('c:step_up'), description: i18n.t('c:step_up.text') };
};

interface StepUpDialogProps {
  methods: StepUpMethod[];
  onStepUp: () => void;
}

/**
 * Asks the user to prove it's them, in this dialog: with a passkey or TOTP they hold, or an emailed code. An action
 * that needs a factor the user lacks sets one up here, after the code when the sign-in is not recent; setting it up
 * steps the session up. A user who lost their factor sets up a new one the same way.
 */
function StepUpDialog({ methods, onStepUp }: StepUpDialogProps) {
  const { t } = useTranslation();
  const holdsFactor = methods.some(isFactor);
  const [view, setView] = useState<View>(firstView(methods));
  // The factor to set up once the emailed code is in; null when the code is the step-up itself.
  const [next, setNext] = useState<Factor | null>(null);
  // A wrong code remounts the form, so the code is entered again.
  const [codeVersion, setCodeVersion] = useState(0);

  useEffect(() => dialoger.getState().update(dialogId, headings(view, holdsFactor)), [view, holdsFactor]);

  const { mutate: prove, isPending: proving } = useMutation({ mutationFn: (body: StepUpData['body']) => stepUp({ body }) });
  const { mutate: sendCode, isPending: sending } = useMutation({ mutationFn: () => sendStepUpCode(), onSuccess: () => setView('code') });
  const { mutate: addPasskey, isPending: addingPasskey } = useCreatePasskeyMutation();

  const setUp = (factor: Factor) => {
    if (factor === 'passkey') addPasskey(undefined, { onSuccess: onStepUp });
    else setView('totp-setup');
  };

  // Setting up a factor asks for presence first: a recent sign-in, a factor held, or else the emailed code.
  const { mutate: startSetUp, isPending: preparing } = useMutation({
    mutationFn: (_factor: Factor) => getStepUp({ query: { tier: 'enroll' } }),
    onSuccess: ({ steppedUp }, factor) => {
      if (steppedUp) return setUp(factor);
      setNext(factor);
      sendCode();
    },
  });

  const confirmWithPasskey = async () => {
    try {
      prove({ passkeyData: await getPasskeyStepUpCredential() }, { onSuccess: onStepUp });
    } catch {
      toaster.error(t('error:passkey_verification_failed'));
    }
  };

  const submitCode = ({ code }: { code: string }) =>
    prove({ emailCode: code }, { onSuccess: () => (next ? setUp(next) : onStepUp()), onError: () => setCodeVersion((version) => version + 1) });

  // An impersonation never steps up: the admin acts as the user, not on how the account is protected.
  if (methods.length === 0) return <p className="text-muted-foreground text-sm">{t('error:impersonation_forbidden.text')}</p>;

  if (view === 'totp') {
    return (
      <TotpConfirmationForm
        loading={proving}
        onSubmit={({ code }) => prove({ totpCode: code }, { onSuccess: onStepUp })}
        onCancel={() => setView('choose')}
      />
    );
  }

  if (view === 'code') {
    return (
      <div className="flex flex-col gap-3">
        <TotpConfirmationForm
          key={codeVersion}
          label={t('c:step_up_code_label')}
          loading={proving}
          onSubmit={submitCode}
          onCancel={() => setView(next ? 'add' : 'choose')}
        />
        <p className="text-center text-muted-foreground text-sm">
          {t('c:step_up_no_mail')}{' '}
          <InlineLinkButton disabled={sending} onClick={() => sendCode()}>
            {t('c:step_up_code_resend')}
          </InlineLinkButton>
        </p>
      </div>
    );
  }

  if (view === 'totp-setup') {
    return (
      <Suspense fallback={<Skeleton className="mx-auto my-3 size-72.75" />}>
        <TotpSetup onDone={onStepUp} onCancel={() => setView('add')} />
      </Suspense>
    );
  }

  if (view === 'add') {
    return (
      <div className="flex flex-col gap-2">
        {isStrategyEnabled('passkey') && (
          <Button className="w-full" loading={preparing || sending || addingPasskey} onClick={() => startSetUp('passkey')}>
            <FingerprintPatternIcon />
            {t('c:step_up_add_passkey')}
          </Button>
        )}
        {isStrategyEnabled('totp') && (
          <Button variant="secondary" className="w-full" disabled={preparing || sending} onClick={() => startSetUp('totp')}>
            <SmartphoneIcon />
            {t('c:step_up_add_totp')}
          </Button>
        )}
        {holdsFactor && (
          <Button variant="ghost" className="w-full" onClick={() => setView('choose')}>
            {t('c:back')}
          </Button>
        )}
      </div>
    );
  }

  const factors = methods.filter(isFactor);
  if (!factors.length) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          <NamedText i18nKey="c:step_up_email.text" values={{ email: getCurrentUser().email }} />
        </p>
        <Button className="w-full" loading={sending} onClick={() => sendCode()}>
          <MailIcon />
          {t('c:step_up_email')}
        </Button>
      </div>
    );
  }

  // `enroll` sets up a new factor, `email` (while setting one up) mails the code: both are for a lost factor.
  const recovery = methods.includes('enroll') ? 'enroll' : methods.includes('email') ? 'email' : null;

  return (
    <div className="flex flex-col gap-2">
      {factors.includes('passkey') && (
        <Button variant="secondary" className="w-full" loading={proving} onClick={confirmWithPasskey}>
          <FingerprintPatternIcon />
          {t('c:passkey.confirm')}
        </Button>
      )}
      {factors.includes('totp') && (
        <Button variant="secondary" className="w-full" onClick={() => setView('totp')}>
          <SmartphoneIcon />
          {t('c:authenticator_app.confirm')}
        </Button>
      )}
      {recovery && (
        <p className="mt-2 text-center text-muted-foreground text-sm">
          {t('c:step_up_lost_factor')}{' '}
          <InlineLinkButton disabled={sending} onClick={() => (recovery === 'enroll' ? setView('add') : sendCode())}>
            {t(recovery === 'enroll' ? 'c:step_up_new_factor' : 'c:step_up_email')}
          </InlineLinkButton>
        </p>
      )}
    </div>
  );
}

/** Opens the re-auth dialog; resolves once this session is stepped up, rejects with `StepUpDismissedError` when closed. */
export const openStepUpDialog = (methods: StepUpMethod[]) =>
  new Promise<void>((resolve, reject) => {
    let steppedUp = false;
    dialoger.getState().create(
      <StepUpDialog
        methods={methods}
        onStepUp={() => {
          steppedUp = true;
          dialoger.getState().remove(dialogId);
          resolve();
        }}
      />,
      {
        id: dialogId,
        triggerRef: { current: null },
        className: 'sm:max-w-md',
        ...headings(firstView(methods), methods.some(isFactor)),
        onClose: () => {
          if (!steppedUp) reject(new StepUpDismissedError());
        },
      },
    );
  });
