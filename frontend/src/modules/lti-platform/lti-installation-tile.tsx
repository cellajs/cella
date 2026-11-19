import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import type { TFunction } from 'i18next';
import { BlocksIcon, CheckIcon, KeyRoundIcon, PlusIcon, PowerIcon, PowerOffIcon, XIcon } from 'lucide-react';
import { type MouseEvent, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { LtiInstallation, LtiResourceLink } from 'sdk';
import { zApproveLtiInstallationBody, zCreateLtiResourceLinkBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { ExpandableTile, ExpandableTileDetail, type TileTone } from '~/modules/common/expandable-tile';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { scopeLabel } from '~/modules/common/scope-badges';
import {
  useApproveLtiInstallationMutation,
  useCreateLtiResourceLinkMutation,
  useDeleteLtiResourceLinkMutation,
  useRejectLtiInstallationMutation,
  useSetLtiInstallationStatusMutation,
  useUpdateLtiInstallationMutation,
} from '~/modules/lti-platform/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import {
  FieldContent,
  FieldLabel,
  FieldLayout,
  FieldTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import type { QueryOrgContext } from '~/query/types';
import { dateShort } from '~/utils/date-short';
import { formResolver } from '~/utils/form-resolver';

type PersonalField = LtiInstallation['requestedFields'][number];

type AccessScope = LtiInstallation['requestedScopes'][number];

const fieldLabels = { name: 'c:name', email: 'c:email', picture: 'c:profile_picture' } as const satisfies Record<PersonalField, string>;

const statusTones = { pending: 'warning', active: 'info', disabled: 'muted' } as const satisfies Record<LtiInstallation['status'], TileTone>;

const statusLabels = { pending: 'c:waiting_for_approval', active: 'c:active', disabled: 'c:disabled' } as const;

const approveDialogId = (installation: LtiInstallation) => `approve-lti-tool-${installation.id}`;

/** Personal fields as a reader sees them. */
function FieldList({ fields }: { fields: PersonalField[] }) {
  const { t } = useTranslation();
  if (!fields.length) return t('c:no_personal_fields');
  return fields.map((field) => t(fieldLabels[field])).join(', ');
}

/** An access scope as an admin decides on it: people are read only where the LTI tool has a tab, with the shared fields. */
const ltiScopeLabel = (t: TFunction, scope: AccessScope) => (scope === 'user:read' ? t('c:lti_scope_user_read') : scopeLabel(t, scope));

const approveSchema = zApproveLtiInstallationBody;

/**
 * Where the LTI tool's launches go, and the fields and access scopes it asked for as choices with none chosen: what an
 * approval releases and grants is the admin's act.
 */
function ApproveLtiToolForm({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate: approve, isPending } = useApproveLtiInstallationMutation();
  const form = useForm<z.infer<typeof approveSchema>>({
    resolver: formResolver(approveSchema),
    defaultValues: { releasedFields: [], grantedScopes: [] },
  });

  const onSubmit = ({ releasedFields, grantedScopes }: z.infer<typeof approveSchema>) =>
    approve(
      { path: { ...path, ltiInstallationId: installation.id }, body: { releasedFields, grantedScopes } },
      { onSuccess: () => dialoger.getState().remove(approveDialogId(installation)) },
    );

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="group-label text-xs">{t('c:launch_origins')}</span>
          <ul className="text-sm break-all">
            {installation.launchOrigins.map((origin) => (
              <li key={origin}>{origin}</li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">{t('c:launch_origins.text')}</p>
        </div>
        {installation.requestedFields.length > 0 && (
          <FormField
            control={form.control}
            name="releasedFields"
            render={({ field }) => (
              <FormItem name="releasedFields">
                <FormLabel>{t('c:released_fields')}</FormLabel>
                <CheckboxGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-3">
                  {installation.requestedFields.map((personalField) => (
                    <FieldLabel key={personalField} card>
                      <Field.Item render={<FieldLayout orientation="horizontal" />}>
                        <Checkbox value={personalField} />
                        <FieldContent>
                          <FieldTitle>{t(fieldLabels[personalField])}</FieldTitle>
                        </FieldContent>
                      </Field.Item>
                    </FieldLabel>
                  ))}
                </CheckboxGroup>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <p className="text-muted-foreground text-sm">{t('c:released_fields.text')}</p>
        {installation.requestedScopes.length > 0 && (
          <div className="flex flex-col gap-2">
            <FormField
              control={form.control}
              name="grantedScopes"
              render={({ field }) => (
                <FormItem name="grantedScopes">
                  <FormLabel>{t('c:api_access')}</FormLabel>
                  <CheckboxGroup value={field.value ?? []} onValueChange={field.onChange} className="grid gap-3">
                    {installation.requestedScopes.map((scope) => (
                      <FieldLabel key={scope} card>
                        <Field.Item render={<FieldLayout orientation="horizontal" />}>
                          <Checkbox value={scope} />
                          <FieldContent>
                            <FieldTitle>{ltiScopeLabel(t, scope)}</FieldTitle>
                          </FieldContent>
                        </Field.Item>
                      </FieldLabel>
                    ))}
                  </CheckboxGroup>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-muted-foreground text-sm">{t('c:api_access.text')}</p>
          </div>
        )}
        <FormActions>
          <SubmitButton icon={<CheckIcon />} loading={isPending}>
            {t('c:approve')}
          </SubmitButton>
        </FormActions>
      </form>
    </Form>
  );
}

const tabSchema = zCreateLtiResourceLinkBody.pick({ title: true });

/** The tabs that launch this installation in the organization: remove one, or add one under a title. */
function InstallationTabs({
  installation,
  organization,
  links,
}: {
  installation: LtiInstallation;
  organization: EnrichedOrganization;
  links: LtiResourceLink[];
}) {
  const { t } = useTranslation();
  const { mutate: create, isPending } = useCreateLtiResourceLinkMutation();
  const { mutate: remove } = useDeleteLtiResourceLinkMutation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const form = useForm<z.infer<typeof tabSchema>>({ resolver: formResolver(tabSchema), defaultValues: { title: installation.name } });

  const onSubmit = ({ title }: z.infer<typeof tabSchema>) =>
    create(
      { path, body: { channelType: 'organization', channelId: organization.id, installationId: installation.id, title } },
      { onSuccess: () => form.reset({ title: installation.name }) },
    );

  return (
    <div className="flex flex-col gap-2">
      <span className="group-label text-xs">{t('c:tabs')}</span>
      {links.map((link) => (
        <div key={link.id} className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm">
          <span className="min-w-0 grow truncate">{link.title}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('c:remove_resource', { resource: t('c:tab') })}
            onClick={() => remove({ path: { ...path, ltiResourceLinkId: link.id }, channelId: link.channelId })}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex items-start gap-2">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem name="title" className="grow">
                <FormControl>
                  <Input {...field} aria-label={t('c:title')} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton variant="secondary" icon={<PlusIcon />} loading={isPending}>
            {t('c:add_resource', { resource: t('c:tab') })}
          </SubmitButton>
        </form>
      </Form>
    </div>
  );
}

/** The access scopes an approved LTI tool asked for, each granted or not; taking one away asks first. */
function InstallationApiAccess({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate: update, isPending } = useUpdateLtiInstallationMutation();

  const grant = (grantedScopes: AccessScope[]) => update({ path: { ...path, ltiInstallationId: installation.id }, body: { grantedScopes } });

  const openWithdrawConfirm = (event: MouseEvent<HTMLButtonElement>, scope: AccessScope) =>
    openConfirm(event.currentTarget, {
      id: `withdraw-lti-scope-${installation.id}-${scope}`,
      title: <NamedText i18nKey="c:confirm.withdraw_api_access" name={installation.name} />,
      label: 'c:withdraw',
      icon: XIcon,
      onConfirm: () => grant(installation.grantedScopes.filter((granted) => granted !== scope)),
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="group-label text-xs">{t('c:api_access')}</span>
      {installation.requestedScopes.map((scope) =>
        installation.grantedScopes.includes(scope) ? (
          <div key={scope} className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm">
            <CheckIcon className="text-success size-4 shrink-0" />
            <span className="min-w-0 grow">{ltiScopeLabel(t, scope)}</span>
            <Button variant="ghost" size="sm" onClick={(event) => openWithdrawConfirm(event, scope)}>
              {t('c:withdraw')}
            </Button>
          </div>
        ) : (
          <div key={scope} className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm">
            <span className="text-muted-foreground min-w-0 grow pl-6">{ltiScopeLabel(t, scope)}</span>
            <Button variant="secondary" size="sm" loading={isPending} onClick={() => grant([...installation.grantedScopes, scope])}>
              <KeyRoundIcon />
              {t('c:grant')}
            </Button>
          </div>
        ),
      )}
      <p className="text-muted-foreground text-sm">{t('c:api_access.text')}</p>
    </div>
  );
}

interface LtiInstallationTileProps {
  installation: LtiInstallation;
  organization: EnrichedOrganization;
  /** The organization's resource links that launch this installation. */
  resourceLinks: LtiResourceLink[];
}

/** One installed LTI tool: a waiting one is approved or rejected, an approved one disabled or enabled and placed as tabs. */
export function LtiInstallationTile({ installation, organization, resourceLinks }: LtiInstallationTileProps) {
  const { t } = useTranslation();
  const approveRef = useRef<HTMLButtonElement>(null);
  const { mutate: reject } = useRejectLtiInstallationMutation();
  const { mutate: setStatus, isPending: settingStatus } = useSetLtiInstallationStatusMutation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const isPending = installation.status === 'pending';

  const openApproveDialog = () =>
    dialoger.getState().create(<ApproveLtiToolForm installation={installation} path={path} />, {
      id: approveDialogId(installation),
      triggerRef: approveRef,
      className: 'md:max-w-xl',
      title: <NamedText i18nKey="c:confirm.approve_lti_tool" name={installation.name} />,
    });

  const openRejectConfirm = (event: MouseEvent<HTMLButtonElement>) =>
    openConfirm(event.currentTarget, {
      id: `reject-lti-tool-${installation.id}`,
      title: <NamedText i18nKey="c:confirm.reject_lti_tool" name={installation.name} />,
      label: 'c:reject',
      icon: XIcon,
      onConfirm: () => reject({ path: { ...path, ltiInstallationId: installation.id } }),
    });

  const toggleStatus = () =>
    setStatus({
      path: { ...path, serviceAccountId: installation.id },
      body: { status: installation.status === 'active' ? 'disabled' : 'active' },
    });

  return (
    <ExpandableTile
      value={installation.id}
      icon={<BlocksIcon />}
      title={installation.name}
      status={{ tone: statusTones[installation.status], label: t(statusLabels[installation.status]) }}
      meta={installation.launchOrigins.map((origin) => new URL(origin).host).join(', ')}
      lead={
        !isPending && (
          <>
            <InstallationTabs installation={installation} organization={organization} links={resourceLinks} />
            {installation.requestedScopes.length > 0 && <InstallationApiAccess installation={installation} path={path} />}
          </>
        )
      }
      details={
        <>
          {installation.description && (
            <ExpandableTileDetail label={t('c:description')} wide>
              {installation.description}
            </ExpandableTileDetail>
          )}
          <ExpandableTileDetail label={t('c:launch_origins')} wide>
            {installation.launchOrigins.join(', ')}
          </ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:lti_tool_domain')}>{installation.domain}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:asks_for')}>
            <FieldList fields={installation.requestedFields} />
          </ExpandableTileDetail>
          {!isPending && (
            <ExpandableTileDetail label={t('c:released_fields')}>
              <FieldList fields={installation.releasedFields} />
            </ExpandableTileDetail>
          )}
          <ExpandableTileDetail label={t('c:created_at')}>
            <DateTooltip date={installation.createdAt}>
              <span>{dateShort(installation.createdAt)}</span>
            </DateTooltip>
          </ExpandableTileDetail>
        </>
      }
      actions={
        isPending ? (
          <>
            <Button ref={approveRef} size="sm" className="max-sm:w-full" onClick={openApproveDialog}>
              <CheckIcon />
              {t('c:approve')}
            </Button>
            <Button variant="secondary" size="sm" className="max-sm:w-full" onClick={openRejectConfirm}>
              <XIcon />
              {t('c:reject')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" className="max-sm:w-full" loading={settingStatus} onClick={toggleStatus}>
            {installation.status === 'active' ? <PowerOffIcon /> : <PowerIcon />}
            {t(installation.status === 'active' ? 'c:disable' : 'c:enable')}
          </Button>
        )
      }
    />
  );
}
