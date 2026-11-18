import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { GraduationCapIcon, LinkIcon, TrashIcon } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Connection, CreateLtiRegistrationLinkResponse } from 'sdk';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { ExpandableTile, ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { SecretBox } from '~/modules/common/secret-box';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import { ltiConnectionsQueryOptions, useCreateLtiRegistrationLinkMutation, useDeleteLtiConnectionMutation } from '~/modules/connections/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
import type { QueryOrgContext } from '~/query/types';
import { clockTime, dateShort } from '~/utils/date-short';

/** One LTI platform the app is registered at; deleting it ends the launches from there. */
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
