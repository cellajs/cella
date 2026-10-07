import { type RefObject, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { LegalDialogNavProvider } from '~/modules/auth/legal/legal-cross-link';
import { LegalText } from '~/modules/auth/legal/legal-text';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** Legal dialog body. Owns the current subject so cross-links can swap terms <-> privacy in place, without navigating to /legal. */
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
      <Suspense fallback={<Spinner className="mt-10 size-10" />}>
        <LegalText subject={subject} />
      </Suspense>
    </LegalDialogNavProvider>
  );
}

// The links take the notice's font size, which a caller may shrink.
const linkClassName = tw('h-auto p-0 text-[length:inherit]');

interface LegalNoticeProps {
  email?: string;
  mode?: 'waitlist' | 'signup' | 'verify' | 'continue';
  className?: string;
}

export function LegalNotice({ email = '', mode = 'signup', className }: LegalNoticeProps) {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const termsButtonRef = useRef(null);
  const privacyButtonRef = useRef(null);

  const openDialog = (legalSubject: LegalSubject, triggerRef: RefObject<HTMLButtonElement | null>) => () => {
    createDialog(<LegalDialog initialSubject={legalSubject} />, {
      id: 'legal',
      triggerRef,
      title: t(legalConfig[legalSubject].label),
      className: tw('p-6 md:max-w-4xl'),
      outsideScroll: true,
      drawerOnMobile: false,
    });
  };

  return (
    <p className={cn('space-x-1 text-center', className)}>
      {mode === 'continue' && <span>{t('c:legal_notice_continue.text')}</span>}
      {mode === 'signup' && <span>{email ? t('c:legal_notice_email.text', { email }) : t('c:legal_notice.text')}</span>}
      {mode === 'waitlist' && <span>{t('c:legal_notice_waitlist.text', { email })}</span>}
      {mode === 'verify' && <span>{t('c:request_verification.legal_notice')}</span>}
      <Button ref={termsButtonRef} type="button" variant="link" className={linkClassName} onClick={openDialog('terms', termsButtonRef)}>
        {t('c:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button ref={privacyButtonRef} type="button" variant="link" className={linkClassName} onClick={openDialog('privacy', privacyButtonRef)}>
        {t('c:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {appConfig.company.name}.</span>
    </p>
  );
}
