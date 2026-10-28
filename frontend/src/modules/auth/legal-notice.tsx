import { type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { usePreloadLazyComponents } from '~/hooks/use-preload-lazy-components';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { LegalDialogNavProvider } from '~/modules/auth/legal/legal-cross-link';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
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

/** Opens one legal text in the legal dialog; `Trans` hands it the link text. */
function LegalNoticeLink({ subject, children }: { subject: LegalSubject; children?: ReactNode }) {
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

const noticeKeys = {
  signup: 'c:legal_notice.text',
  continue: 'c:legal_notice_continue.text',
  waitlist: 'c:legal_notice_waitlist.text',
  verify: 'c:legal_notice_verify.text',
} as const;

interface LegalNoticeProps {
  /** Named in the sign-up sentence. */
  email?: string;
  mode: keyof typeof noticeKeys;
  className?: string;
}

export function LegalNotice({ email, mode, className }: LegalNoticeProps) {
  const { t } = useTranslation();
  usePreloadLazyComponents(linkedTexts);

  return (
    <p className={cn('text-center', className)}>
      <Trans
        t={t}
        i18nKey={mode === 'signup' && email ? 'c:legal_notice_email.text' : noticeKeys[mode]}
        values={{ email }}
        components={{ terms: <LegalNoticeLink subject="terms" />, privacy: <LegalNoticeLink subject="privacy" /> }}
      />
    </p>
  );
}
