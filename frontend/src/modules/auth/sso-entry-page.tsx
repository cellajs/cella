import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { ssoEntryQueryOptions } from '~/modules/auth/query';
import { ssoStartUrl } from '~/modules/auth/sso-strategy';
import { ErrorNotice } from '~/modules/common/error-notice';
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

  if (error) return <ErrorNotice error={error} boundary="auth" />;
  if (isPending || !data) return <Spinner size="lg" />;

  const { institution, organization, federation, status } = data;
  const organizationName = organization?.name ?? appConfig.name;
  const image = organization?.thumbnailUrl ?? institution.logoUrl;

  return (
    <>
      <AuthHeader
        image={image && <img src={image} alt="" className="size-14 rounded-md" loading="lazy" referrerPolicy="no-referrer" />}
        title={t('c:sso_entry', { organization: organizationName })}
        description={t('c:sso_entry.text', { institution: institution.name })}
      />

      {status === 'active' ? (
        <Button size="block" render={<a href={ssoStartUrl({ connectionId }, { redirectPath: redirect })} />}>
          <span className="truncate">{t('c:continue_to_institution', { institution: institution.name })}</span>
          <span className="shrink-0 font-normal">{t('c:sign_in_via_federation', { federation: federation.name })}</span>
        </Button>
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            {t(status === 'pending' ? 'c:sso_entry_pending.text' : 'c:sso_entry_disabled.text', {
              institution: institution.name,
            })}
          </AlertDescription>
        </Alert>
      )}

      <Button variant="glass" className="self-center" render={<Link to="/auth/authenticate" search={redirect ? { redirect } : {}} />}>
        <ArrowLeftIcon />
        {t('c:sign_in_another_way')}
      </Button>
    </>
  );
}
