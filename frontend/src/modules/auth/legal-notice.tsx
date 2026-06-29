import { type RefObject, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { LegalDialogNavProvider } from '~/modules/auth/legal/legal-cross-link';
import { LegalText } from '~/modules/auth/legal/legal-text';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/**
 * Self-contained legal dialog body. Owns the current subject so cross-links can swap
 * content (terms <-> privacy) without leaving the page. Keeps the dialog title in sync
 * and resets scroll to the top on each swap.
 */
function LegalDialog({ initialSubject }: { initialSubject: LegalSubject }) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState(initialSubject);

  useEffect(() => {
    const dialoger = useDialoger.getState();
    dialoger.update('legal', { title: t(legalConfig[subject].label) });
    dialoger.scrollToTop('legal');
  }, [subject, t]);

  return (
    <LegalDialogNavProvider value={setSubject}>
      <Suspense fallback={<Spinner className="mt-10 h-10 w-10" />}>
        <LegalText subject={subject} />
      </Suspense>
    </LegalDialogNavProvider>
  );
}

/**
 * Renders a legal notice with links open a dialog for the terms and privacy policy.
 */
interface LegalNoticeProps {
  email?: string;
  mode?: 'waitlist' | 'signup' | 'verify';
}

export const LegalNotice = ({ email = '', mode = 'signup' }: LegalNoticeProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const termsButtonRef = useRef(null);
  const privacyButtonRef = useRef(null);

  const openDialog = (legalSubject: LegalSubject, triggerRef: RefObject<HTMLButtonElement | null>) => () => {
    createDialog(<LegalDialog initialSubject={legalSubject} />, {
      id: 'legal',
      triggerRef,
      title: t(legalConfig[legalSubject].label),
      className: 'md:max-w-4xl p-6',
      outsideScroll: true,
      drawerOnMobile: false,
    });
  };

  return (
    <p className="space-x-1 text-center">
      {mode === 'signup' &&
        (email ? <span>{t('c:legal_notice_email.text', { email })}</span> : <span>{t('c:legal_notice.text')}</span>)}
      {mode === 'waitlist' && <span>{t('c:legal_notice_waitlist.text', { email })}</span>}
      {mode === 'verify' && <span>{t('c:request_verification.legal_notice')}</span>}
      <Button
        ref={termsButtonRef}
        type="button"
        variant="link"
        className="h-auto p-0 text-base"
        onClick={openDialog('terms', termsButtonRef)}
      >
        {t('c:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button
        ref={privacyButtonRef}
        type="button"
        variant="link"
        className="h-auto p-0 text-base"
        onClick={openDialog('privacy', privacyButtonRef)}
      >
        {t('c:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {appConfig.company.name}.</span>
    </p>
  );
};
