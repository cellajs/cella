import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import { ssoEntryQueryOptions, ssoStartUrl } from '~/modules/auth/sso-providers';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Spinner } from '~/modules/common/spinner';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

/**
 * The entry of an institution's sign-in: the link an institution shares with its members. Says where the sign-in leads
 * and through which account, refuses before any redirect when the connection is not active (the federation's own
 * refusal pages never return here), and sends the browser to the federation.
 */
export function SsoEntryPage() {
  const { t } = useTranslation();
  const { connectionId } = useParams({ from: '/_public/auth/sso/$connectionId' });
  const { redirect } = useSearch({ from: '/_public/auth/sso/$connectionId' });

  const { data, error, isPending } = useQuery(ssoEntryQueryOptions(connectionId));

  if (error) return <ErrorNotice error={error as ErrorNoticeError} boundary="public" />;
  if (isPending || !data) return <Spinner className="size-10" />;

  const { institution, organization, federation, status } = data;
  const organizationName = organization?.name ?? appConfig.name;
  const image = organization?.thumbnailUrl ?? institution.logoUrl;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {image && <img src={image} alt="" className="size-12 rounded-md" loading="lazy" referrerPolicy="no-referrer" />}
        <h1 className="text-2xl">{t('c:sso_entry', { organization: organizationName })}</h1>
        <p className="text-muted-foreground text-sm">{t('c:sso_entry.text', { institution: institution.displayName, appName: appConfig.name })}</p>
      </div>

      {status === 'active' ? (
        <Button className="w-full" render={<a href={ssoStartUrl({ connectionId }, { redirectAfter: safeRedirectPath(redirect) })} />}>
          {t('c:continue_to_institution', { institution: institution.displayName })}
          <span className="opacity-70">{t('c:sign_in_via_federation', { federation: federation.label })}</span>
        </Button>
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            {t(status === 'pending' ? 'c:sso_entry_pending.text' : 'c:sso_entry_disabled.text', {
              institution: institution.displayName,
              appName: appConfig.name,
            })}
          </AlertDescription>
        </Alert>
      )}

      <Button variant="link" render={<Link to="/auth/authenticate" search={redirect ? { redirect } : {}} />}>
        {t('c:sign_in_another_way')}
      </Button>
    </div>
  );
}
