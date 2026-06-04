import { type RefObject, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { type LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';
import { LegalText } from '~/modules/marketing/legal/legal-text';
import { Button } from '~/modules/ui/button';
import { ScrollArea } from '~/modules/ui/scroll-area';

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
      <ScrollArea className="max-h-[75vh]">
        <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
          <LegalText subject={legalSubject} />
        </Suspense>
      </ScrollArea>
    );

    createDialog(dialogComponent, {
      id: 'legal',
      triggerRef,
      title: t(legalConfig[legalSubject].label),
      className: 'md:max-w-4xl mb-10 p-6',
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
