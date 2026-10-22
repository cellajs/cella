import { Trans, useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { InlineLinkButton } from '~/modules/auth/inline-link-button';

/** Tells a visitor that sign-up is closed; with a waitlist it also offers the way to request an invitation. */
export function SignUpDisabled({ onRequest }: { onRequest: () => void }) {
  const { t } = useTranslation();

  return (
    <p>
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
