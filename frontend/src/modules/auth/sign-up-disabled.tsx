import { Trans, useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { InlineLinkButton } from '~/modules/auth/inline-link-button';
import { cn } from '~/utils/cn';

/** Tells a visitor that sign-up is closed; with a waitlist it also offers the way to request an invitation. */
export function SignUpDisabled({ onRequest, className }: { onRequest: () => void; className?: string }) {
  const { t } = useTranslation();

  return (
    <p className={cn('text-center', className)}>
      {t('c:sign_up_disabled.text')}
      {appConfig.has.waitlist && (
        <>
          {' '}
          <Trans t={t} i18nKey="c:request_invitation.text" components={{ request_anchor: <InlineLinkButton onClick={onRequest} /> }} />
        </>
      )}
    </p>
  );
}
