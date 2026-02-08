import { type RefObject, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import type { LegalSubject } from '~/modules/marketing/legal/legal-config';
import { LegalText } from '~/modules/marketing/legal/legal-text';
import { Button } from '~/modules/ui/button';

export const LegalNotice = ({
  email = '',
  mode = 'signup',
}: {
  email?: string;
  mode?: 'waitlist' | 'signup' | 'verify';
}) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const termsButtonRef = useRef(null);
  const privacyButtonRef = useRef(null);

  const openDialog = (legalSubject: LegalSubject, triggerRef: RefObject<HTMLButtonElement | null>) => () => {
    const dialogComponent = (
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <LegalText subject={legalSubject} />
      </Suspense>
    );

    createDialog(dialogComponent, {
      id: 'legal',
      triggerRef,
      className: 'md:max-w-3xl mb-10 px-6',
      drawerOnMobile: false,
    });
  };

  return (
    <p className="font-light text-center space-x-1">
      {mode === 'signup' &&
        (email ? (
          <span>{t('common:legal_notice_email.text', { email })}</span>
        ) : (
          <span>{t('common:legal_notice.text')}</span>
        ))}
      {mode === 'waitlist' && <span>{t('common:legal_notice_waitlist.text', { email })}</span>}
      {mode === 'verify' && <span>{t('common:request_verification.legal_notice')}</span>}
      <Button
        ref={termsButtonRef}
        type="button"
        variant="link"
        className="p-0 text-base h-auto"
        onClick={openDialog('terms', termsButtonRef)}
      >
        {t('common:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button
        ref={privacyButtonRef}
        type="button"
        variant="link"
        className="p-0 text-base h-auto"
        onClick={openDialog('privacy', privacyButtonRef)}
      >
        {t('common:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {appConfig.company.name}.</span>
    </p>
  );
};
