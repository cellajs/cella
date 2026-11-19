import { onlineManager, useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { GraduationCapIcon, LinkIcon, TrashIcon } from 'lucide-react';
import { type MouseEvent, Suspense, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import type { Connection, CreateLtiRegistrationLinkResponse, ListLtiContextsResponse } from 'sdk';
import type { TKey } from '~/lib/i18n-locales';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { ExpandableTile, ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { SecretBox } from '~/modules/common/secret-box';
import { Spinner } from '~/modules/common/spinner';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import {
  ltiConnectionsQueryOptions,
  ltiContextsQueryOptions,
  useCreateLtiRegistrationLinkMutation,
  useDeleteLtiConnectionMutation,
} from '~/modules/connections/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
import { getQueryItems } from '~/query/basic/mutate-query';
import type { QueryOrgContext } from '~/query/types';
import { dateRelative } from '~/utils/date-mini';
import { clockTime, dateShort } from '~/utils/date-short';

type LtiContext = ListLtiContextsResponse['results'][number];

const importIssues = {
  address_refused: 'c:lti_import.address_refused',
  scope_not_granted: 'c:lti_import.scope_not_granted',
  token_refused: 'c:lti_import.token_refused',
  members_refused: 'c:lti_import.members_refused',
  retrying: 'c:lti_import.retrying',
  failed: 'c:lti_import.failed',
  too_many_members: 'c:lti_import.too_many_members',
  member_limit: 'c:lti_import.member_limit',
  inactive: 'c:lti_import.inactive',
} as const satisfies Record<NonNullable<LtiContext['importIssue']>, TKey>;

/** How the last member import of a course ran; one that stopped short says why, and when. */
function ImportState({ context }: { context: LtiContext }) {
  const { t } = useTranslation();
  const { apiUrl, importRanAt, importReadCount, importIssue } = context;

  if (!apiUrl) return <p className="text-muted-foreground">{t('c:lti_import.no_api')}</p>;
  if (!importRanAt) return <p className="text-muted-foreground">{t('c:lti_import.not_run')}</p>;
  if (!importIssue) return <p>{t('c:lti_import.read', { count: importReadCount ?? 0, time: dateRelative(importRanAt) })}</p>;
  return (
    <p className="flex flex-wrap gap-x-2">
      <span className="text-warning">{t(importIssues[importIssue])}</span>
      <DateTooltip date={importRanAt}>
        <span className="text-muted-foreground">{dateRelative(importRanAt)}</span>
      </DateTooltip>
    </p>
  );
}

/** The courses a platform launched the app from, each with the channel it maps to and how its people were last imported. */
function LtiContextList({ path, connectionId }: { path: QueryOrgContext; connectionId: string }) {
  const { t } = useTranslation();
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(ltiContextsQueryOptions(path, connectionId));
  const contexts = getQueryItems(data);
  const total = data.pages.at(-1)?.totalSize ?? contexts.length;
  return (
    <>
      {contexts.length === 0 && <p className="text-faint-foreground text-sm">{t('c:no_resource_yet', { resource: t('c:lti_contexts') })}</p>}
      <ul className="flex flex-col gap-2">
        {contexts.map((context) => (
          <li key={context.id} className="flex flex-col gap-0.5 rounded-md border px-3 py-2 text-sm">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium">{context.title ?? context.label ?? context.contextId}</span>
              {context.title && context.label && <span className="text-muted-foreground shrink-0">{context.label}</span>}
              <span className="text-muted-foreground ml-auto truncate">{context.channel.name}</span>
            </div>
            <ImportState context={context} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <Button variant="ghost" className="w-full" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
          {t('c:show_more', { count: total - contexts.length })}
        </Button>
      )}
    </>
  );
}

/** The course list under its own boundary: a list that fails to load leaves the connection and its actions standing. */
function LtiContexts({ path, connectionId }: { path: QueryOrgContext; connectionId: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <span className="group-label text-xs">{t('c:lti_contexts')}</span>
      <ErrorBoundary fallback={<p className="text-muted-foreground text-sm">{t('c:lti_contexts.failed')}</p>}>
        <Suspense fallback={<Spinner size="sm" />}>
          <LtiContextList path={path} connectionId={connectionId} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

/** One LTI platform the app is registered at, with its courses; deleting it ends the launches from there. */
function LtiConnectionTile({ connection, path }: { connection: Connection; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate: remove } = useDeleteLtiConnectionMutation();
  const platform = 'productFamilyCode' in connection.config ? connection.config.productFamilyCode : null;
  const deploymentId = 'deploymentIds' in connection.config ? connection.config.deploymentIds[0] : undefined;

  // Deleting ends every launch from that platform: the click asks first
  const openDeleteConfirm = (event: MouseEvent<HTMLButtonElement>) =>
    openConfirm(event.currentTarget, {
      id: `delete-lti-connection-${connection.id}`,
      title: <NamedText i18nKey="c:confirm.delete_lti_connection" name={connection.name} />,
      resource: 'c:connection',
      onConfirm: () => remove({ path: { ...path, connectionId: connection.id } }),
    });

  return (
    <ExpandableTile
      value={connection.id}
      icon={<GraduationCapIcon />}
      title={connection.name}
      lead={<LtiContexts path={path} connectionId={connection.id} />}
      meta={
        <DateTooltip date={connection.createdAt}>
          <span>{dateShort(connection.createdAt)}</span>
        </DateTooltip>
      }
      details={
        <>
          <ExpandableTileDetail label={t('c:issuer')} wide>
            <span className="break-all">{connection.issuer}</span>
          </ExpandableTileDetail>
          {platform && <ExpandableTileDetail label={t('c:platform')}>{platform}</ExpandableTileDetail>}
          <ExpandableTileDetail label={t('c:lti_deployment')} wide>
            {deploymentId ? <span className="break-all">{deploymentId}</span> : t('c:lti_deployment_none')}
          </ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:connected')}>{dateShort(connection.createdAt)}</ExpandableTileDetail>
        </>
      }
      actions={
        <Button variant="secondary" size="sm" className="max-sm:w-full" onClick={openDeleteConfirm}>
          <TrashIcon />
          {t('c:delete')}
        </Button>
      }
    />
  );
}

/** The LTI platforms that launch the app into this organization, and the registration link that connects one more. */
export function LtiConnectionsCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const connections = useSuspenseQuery(ltiConnectionsQueryOptions(path)).data.results;
  const { mutate: createLink, isPending } = useCreateLtiRegistrationLinkMutation();
  // Component state only: the link registers a platform for this tenant, and the query cache persists
  const [link, setLink] = useState<CreateLtiRegistrationLinkResponse | null>(null);
  const [openTile, setOpenTile] = useState<string[]>([]);

  const onCreateLink = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    createLink({ path }, { onSuccess: setLink });
  };

  return (
    <ToolCard label="c:lti_connections" description={t('c:lti_connections.text')}>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="max-sm:w-full sm:self-start" loading={isPending} onClick={onCreateLink}>
          <LinkIcon />
          {t('c:create_resource', { resource: t('c:registration_link') })}
        </Button>
        {link && (
          <>
            <SecretBox value={link.url} />
            <p className="text-muted-foreground text-sm">{t('c:registration_link.text', { time: clockTime(new Date(link.expiresAt)) })}</p>
          </>
        )}
      </div>
      {connections.length > 0 && (
        <Accordion value={openTile} onValueChange={setOpenTile} className="mt-6 flex flex-col gap-2">
          {connections.map((connection) => (
            <LtiConnectionTile key={connection.id} connection={connection} path={path} />
          ))}
        </Accordion>
      )}
    </ToolCard>
  );
}
