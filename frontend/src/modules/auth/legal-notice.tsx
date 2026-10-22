import { type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { usePreloadLazyComponents } from '~/hooks/use-preload-lazy-components';
import { InlineLinkButton } from '~/modules/auth/inline-link-button';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { LegalDialogNavProvider } from '~/modules/auth/legal/legal-cross-link';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** Legal dialog body. Owns the current subject so cross-links can swap terms <-> privacy in place, without navigating to /legal. */
function LegalDialog({ initialSubject }: { initialSubject: LegalSubject }) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState(initialSubject);
  const SubjectText = legalConfig[subject].component;

  useEffect(() => {
    dialoger.getState().update('legal', { title: t(legalConfig[subject].label) });
    dialoger.getState().scrollToTop('legal');
  }, [subject, t]);

  return (
    <LegalDialogNavProvider value={setSubject}>
      <Suspense fallback={<Spinner size="lg" className="mt-10" />}>
        <div className="prose dark:prose-invert max-w-none">
          <SubjectText />
        </div>
      </Suspense>
    </LegalDialogNavProvider>
  );
}

/** Opens one legal text in the legal dialog. */
function LegalNoticeLink({ subject, children }: { subject: LegalSubject; children: ReactNode }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDialog = () => {
    dialoger.getState().create(<LegalDialog initialSubject={subject} />, {
      id: 'legal',
      triggerRef,
      title: t(legalConfig[subject].label),
      className: tw('p-6 md:max-w-4xl'),
      outsideScroll: true,
      drawerOnMobile: false,
    });
  };

  return (
    <InlineLinkButton ref={triggerRef} onClick={openDialog}>
      {children}
    </InlineLinkButton>
  );
}

// Fetched while the notice is read, so the dialog opens at full height with no spinner.
const linkedTexts = [legalConfig.terms.component, legalConfig.privacy.component];

interface LegalNoticeProps {
  email?: string;
  mode?: 'waitlist' | 'signup' | 'verify' | 'continue';
  className?: string;
}

export function LegalNotice({ email = '', mode = 'signup', className }: LegalNoticeProps) {
  const { t } = useTranslation();
  usePreloadLazyComponents(linkedTexts);

  return (
    <p className={cn('space-x-1 text-center', className)}>
      {mode === 'continue' && <span>{t('c:legal_notice_continue.text')}</span>}
      {mode === 'signup' && <span>{email ? t('c:legal_notice_email.text', { email }) : t('c:legal_notice.text')}</span>}
      {mode === 'waitlist' && <span>{t('c:legal_notice_waitlist.text', { email })}</span>}
      {mode === 'verify' && <span>{t('c:request_verification.legal_notice')}</span>}
      <LegalNoticeLink subject="terms">{t('c:terms').toLocaleLowerCase()}</LegalNoticeLink>
      <span>&</span>
      <LegalNoticeLink subject="privacy">{t('c:privacy_policy').toLocaleLowerCase()}</LegalNoticeLink>
      <span>of {appConfig.company.name}.</span>
    </p>
  );
}
