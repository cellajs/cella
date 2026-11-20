import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { BlocksIcon, CheckIcon, KeyRoundIcon, PowerIcon, PowerOffIcon, TrashIcon, XIcon } from 'lucide-react';
import { type MouseEvent, useId, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ListLtiInstallationTabsResponse, LtiInstallation } from 'sdk';
import { zApproveLtiInstallationBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { ExpandableTile, ExpandableTileDetail, type TileTone } from '~/modules/common/expandable-tile';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { scopeLabel } from '~/modules/common/scope-badges';
import { toaster } from '~/modules/common/toaster/toaster';
import { LtiToolOrigin } from '~/modules/lti-platform/lti-tool-origin';
import {
  ltiInstallationTabsQueryOptions,
  useApproveLtiInstallationMutation,
  useDeleteLtiInstallationMutation,
  useDeleteLtiResourceLinkMutation,
  useSetLtiInstallationStatusMutation,
  useUpdateLtiInstallationMutation,
} from '~/modules/lti-platform/query';
import type { EntityRoute } from '~/modules/navigation/types';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { FieldContent, FieldLabel, FieldLayout, FieldTitle, Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import type { QueryOrgContext } from '~/query/types';
import { getChannelPageRoute } from '~/utils/channel-route';
import { dateShort } from '~/utils/date-short';
import { formResolver } from '~/utils/form-resolver';

type PersonalField = LtiInstallation['requestedFields'][number];

type AccessScope = LtiInstallation['requestedScopes'][number];

type TabChannelType = LtiInstallation['channelTypes'][number];

/** The channel types an admin may allow an LTI tool a tab in: those that hold LTI tabs in this app. */
const tabChannelTypes = zApproveLtiInstallationBody.shape.channelTypes.unwrap().element.options;

const fieldLabels = { name: 'c:name', email: 'c:email', picture: 'c:profile_picture' } as const satisfies Record<PersonalField, string>;

const statusTones = { pending: 'warning', active: 'info', disabled: 'muted' } as const satisfies Record<LtiInstallation['status'], TileTone>;

const statusLabels = { pending: 'c:waiting_for_approval', active: 'c:active', disabled: 'c:disabled' } as const;

const approveDialogId = (installation: LtiInstallation) => `approve-lti-tool-${installation.id}`;

const deleteDialogId = (installation: LtiInstallation) => `delete-lti-tool-${installation.id}`;

type LtiInstallationTab = ListLtiInstallationTabsResponse['results'][number];

/** Why a tab that is on does not open, as the Tabs card says it; null for a tab that opens or is off. */
const closureText = (t: TFunction, { closure, channelType }: LtiInstallationTab) => {
  if (!closure || closure === 'lti_tab_switched_off') return null;
  if (closure === 'lti_installation_not_active') return t('c:lti_tab_tool_disabled.text');
  return t(`error:${closure}.text`, { resource: t(`c:${channelType}`) });
};

/** The tabs that are on and that undoing `closure` opens again: closed by it alone, in a page that is not archived. */
const reopening = (tabs: LtiInstallationTab[], closure: 'lti_installation_not_active' | 'lti_tab_type_not_allowed', allowed: TabChannelType[]) =>
  tabs.filter((tab) => tab.closure === closure && !tab.archived && allowed.some((channelType) => channelType === tab.channelType));

interface ReopenConfirmOptions {
  id: string;
  installation: LtiInstallation;
  /** The tabs the change opens again (`reopening`); at least one. */
  tabs: LtiInstallationTab[];
  i18nKey: 'c:confirm.allow_lti_channel_type_tab' | 'c:confirm.enable_lti_tool_tab';
  /** The channel type a question about one names. */
  resource?: string;
  label: 'c:allow' | 'c:enable';
  onConfirm: () => void;
}

/** Asks before a change opens tabs of the LTI tool again, saying how many, and that it reads who is in them where it does. */
const openReopenConfirm = (trigger: HTMLElement, { id, installation, tabs, i18nKey, resource, label, onConfirm }: ReopenConfirmOptions) => {
  const reads = installation.grantedScopes.includes('user:read') && tabs.some((tab) => tab.isLtiContext);
  openConfirm(trigger, {
    id,
    title: (
      <>
        <NamedText
          i18nKey={tabs.length > 1 ? `${i18nKey}_counted` : i18nKey}
          name={installation.name}
          values={{ ...(resource && { resource }), count: tabs.length }}
        />
        {reads && (
          <span className="text-muted-foreground mt-1 block">
            <NamedText i18nKey={tabs.length > 1 ? 'c:lti_tabs_reopen_reads.tab_counted' : 'c:lti_tabs_reopen_reads.tab'} name={installation.name} />
          </span>
        )}
      </>
    ),
    label,
    icon: CheckIcon,
    onConfirm,
  });
};

/** Personal fields as a reader sees them. */
function FieldList({ fields }: { fields: PersonalField[] }) {
  const { t } = useTranslation();
  if (!fields.length) return t('c:no_personal_fields');
  return fields.map((field) => t(fieldLabels[field])).join(', ');
}

/** The pages the LTI tool names, each a link that opens apart; empty when it names none. */
const ltiToolPages = (t: TFunction, { clientUri, tosUri, policyUri }: LtiInstallation) =>
  [
    { href: clientUri, label: t('c:home_page') },
    { href: tosUri, label: t('c:terms_of_use') },
    { href: policyUri, label: t('c:privacy_policy') },
  ].flatMap(({ href, label }) => (href ? [{ href, label }] : []));

/** Each page with the host it goes to beside it: a lookalike shows before the click. */
function LtiToolPageLinks({ pages }: { pages: ReturnType<typeof ltiToolPages> }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {pages.map(({ href, label }) => (
        <span key={label} className="break-all">
          <a href={href} target="_blank" rel="noreferrer" className="link-inline">
            {label}
          </a>{' '}
          <span className="text-muted-foreground">{new URL(href).host}</span>
        </span>
      ))}
    </span>
  );
}

/** An access scope as an admin decides on it: people are read only in the LTI contexts where it has a tab that opens. */
const ltiScopeLabel = (t: TFunction, scope: AccessScope) => (scope === 'user:read' ? t('c:lti_scope_user_read') : scopeLabel(t, scope));

const approveSchema = zApproveLtiInstallationBody;

/**
 * Where the LTI tool's launches go and whose keys act as it, and as choices with none chosen the fields and access
 * scopes it asked for and the channel types it may get a tab in: what an approval trusts, releases and grants is the
 * admin's act.
 */
function ApproveLtiToolForm({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const pages = ltiToolPages(t, installation);
  const { mutate: approve, isPending } = useApproveLtiInstallationMutation();
  const form = useForm<z.infer<typeof approveSchema>>({
    resolver: formResolver(approveSchema),
    defaultValues: { releasedFields: [], grantedScopes: [], channelTypes: [] },
  });

  const onSubmit = ({ releasedFields, grantedScopes, channelTypes }: z.infer<typeof approveSchema>) =>
    approve(
      { path: { ...path, ltiInstallationId: installation.id }, body: { releasedFields, grantedScopes, channelTypes } },
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
        <div className="flex flex-col gap-2">
          <span className="group-label text-xs">{t('c:key_set_origin')}</span>
          <p className="text-sm break-all">{installation.keySetOrigin}</p>
          <p className="text-muted-foreground text-sm">{t('c:key_set_origin.text')}</p>
        </div>
        {pages.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="group-label text-xs">{t('c:lti_tool_pages')}</span>
            <p className="text-sm">
              <LtiToolPageLinks pages={pages} />
            </p>
            <p className="text-muted-foreground text-sm">{t('c:lti_tool_pages.text')}</p>
          </div>
        )}
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
        <div className="flex flex-col gap-2">
          <FormField
            control={form.control}
            name="channelTypes"
            render={({ field }) => (
              <FormItem name="channelTypes">
                <FormLabel>{t('c:lti_tab_channel_types')}</FormLabel>
                <CheckboxGroup value={field.value ?? []} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-3">
                  {tabChannelTypes.map((channelType) => (
                    <FieldLabel key={channelType} card>
                      <Field.Item render={<FieldLayout orientation="horizontal" />}>
                        <Checkbox value={channelType} />
                        <FieldContent>
                          <FieldTitle>{t(`c:${channelType}`)}</FieldTitle>
                        </FieldContent>
                      </Field.Item>
                    </FieldLabel>
                  ))}
                </CheckboxGroup>
                {!field.value?.length && <p className="text-sm">{t('c:lti_tab_channel_types.none')}</p>}
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-muted-foreground text-sm">{t('c:lti_tab_channel_types.text')}</p>
        </div>
        <FormActions>
          <SubmitButton icon={<CheckIcon />} loading={isPending}>
            {t('c:approve')}
          </SubmitButton>
        </FormActions>
      </form>
    </Form>
  );
}

/**
 * Every tab of the LTI tool, linked to its channel, with whom it opens for, the ones switched off marked off and why
 * one that is on does not open. Whoever may update a tab's channel removes it for good here, after a confirmation;
 * channels switch their tabs on and off in their own Tabs card.
 */
function InstallationTabs({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { data } = useQuery(ltiInstallationTabsQueryOptions(path, installation.id));
  const { mutate: remove } = useDeleteLtiResourceLinkMutation();
  const tabs = data?.results ?? [];

  const openRemoveConfirm = (event: MouseEvent<HTMLButtonElement>, tab: (typeof tabs)[number]) =>
    openConfirm(event.currentTarget, {
      id: `remove-lti-tab-${tab.id}`,
      title: <NamedText i18nKey="c:confirm.remove_lti_tab" name={tab.channelName} />,
      label: 'c:remove',
      icon: XIcon,
      onConfirm: () => remove({ path: { ...path, ltiResourceLinkId: tab.id }, channelId: tab.channelId }),
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="group-label text-xs">{t('c:tabs')}</span>
      {tabs.map((tab) => {
        const route: EntityRoute = getChannelPageRoute({ ...path, channelType: tab.channelType, channelId: tab.channelId });
        return (
          <div key={tab.id} className="flex min-h-10 items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm">
            <div className="flex min-w-0 grow flex-col">
              <div className="flex min-w-0 items-baseline gap-2">
                <Link {...route} className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
                  {tab.channelName}
                </Link>
                <span className="text-muted-foreground">{t(`c:${tab.channelType}`)}</span>
                {!tab.enabled && <span className="text-faint-foreground">{t('c:lti_tab_off')}</span>}
              </div>
              <span className="text-muted-foreground text-xs">{t(`c:lti_audience.${tab.audience}`)}</span>
              {closureText(t, tab) && <span className="text-muted-foreground text-xs">{closureText(t, tab)}</span>}
            </div>
            {tab.deletable && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${tab.channelName}: ${t('c:remove_resource', { resource: t('c:tab') })}`}
                onClick={(event) => openRemoveConfirm(event, tab)}
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
        );
      })}
      {data && !tabs.length && <p className="text-faint-foreground text-sm">{t('c:no_resource_yet', { resource: t('c:tabs') })}</p>}
      <p className="text-muted-foreground text-sm">{t('c:lti_tool_tabs.text')}</p>
    </div>
  );
}

/** One grant of an approved LTI tool, given or not; its button's name says what it changes. */
function GrantRow({
  label,
  granted,
  disabled,
  grantLabel,
  onChange,
}: {
  label: string;
  granted: boolean;
  disabled: boolean;
  /** The button's label while it is not given, such as `c:grant`. */
  grantLabel: 'c:grant' | 'c:allow';
  onChange: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const [labelId, actionId] = [useId(), useId()];

  return (
    <div className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm">
      {granted && <CheckIcon className="text-success size-4 shrink-0" />}
      <span id={labelId} className={granted ? 'min-w-0 grow' : 'text-muted-foreground min-w-0 grow pl-6'}>
        {label}
      </span>
      <Button variant={granted ? 'ghost' : 'secondary'} size="sm" disabled={disabled} aria-labelledby={`${actionId} ${labelId}`} onClick={onChange}>
        {!granted && <KeyRoundIcon />}
        <span id={actionId}>{t(granted ? 'c:withdraw' : grantLabel)}</span>
      </Button>
    </div>
  );
}

/** The access scopes an approved LTI tool asked for, each granted or not; taking one away asks first. */
function InstallationApiAccess({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useUpdateLtiInstallationMutation();

  const update = (grantedScopes: AccessScope[]) => mutate({ path: { ...path, ltiInstallationId: installation.id }, body: { grantedScopes } });
  const grant = (scope: AccessScope) => update([...installation.grantedScopes, scope]);
  const withdraw = (scope: AccessScope) => update(installation.grantedScopes.filter((granted) => granted !== scope));

  const openWithdrawConfirm = (event: MouseEvent<HTMLButtonElement>, scope: AccessScope) =>
    openConfirm(event.currentTarget, {
      id: `withdraw-lti-scope-${installation.id}-${scope}`,
      title: <NamedText i18nKey="c:confirm.withdraw_api_access" name={installation.name} />,
      label: 'c:withdraw',
      icon: XIcon,
      onConfirm: () => withdraw(scope),
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="group-label text-xs">{t('c:api_access')}</span>
      {installation.requestedScopes.map((scope) => {
        const granted = installation.grantedScopes.includes(scope);
        const onChange = (event: MouseEvent<HTMLButtonElement>) => (granted ? openWithdrawConfirm(event, scope) : grant(scope));
        return (
          <GrantRow key={scope} label={ltiScopeLabel(t, scope)} granted={granted} grantLabel="c:grant" disabled={isPending} onChange={onChange} />
        );
      })}
      <p className="text-muted-foreground text-sm">{t('c:api_access.text')}</p>
    </div>
  );
}

/**
 * The channel types an approved LTI tool may get a tab in, each allowed or not. Withdrawing one asks first, saying how
 * many of its tabs that open stop opening there, and allowing one again asks when tabs there open again.
 */
function InstallationChannelTypes({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useUpdateLtiInstallationMutation();
  const { data } = useQuery(ltiInstallationTabsQueryOptions(path, installation.id));

  const update = (channelTypes: TabChannelType[]) => mutate({ path: { ...path, ltiInstallationId: installation.id }, body: { channelTypes } });

  const tabs = data?.results ?? [];

  const openWithdrawConfirm = (event: MouseEvent<HTMLButtonElement>, channelType: TabChannelType) => {
    const count = tabs.filter((tab) => !tab.closure && tab.channelType === channelType).length;
    const i18nKey =
      count > 1
        ? 'c:confirm.withdraw_lti_channel_type_tab_counted'
        : count
          ? 'c:confirm.withdraw_lti_channel_type_tab'
          : 'c:confirm.withdraw_lti_channel_type';
    return openConfirm(event.currentTarget, {
      id: `withdraw-lti-channel-type-${installation.id}-${channelType}`,
      title: <NamedText i18nKey={i18nKey} name={installation.name} values={{ resource: t(`c:${channelType}`), count }} />,
      label: 'c:withdraw',
      icon: XIcon,
      onConfirm: () => update(installation.channelTypes.filter((allowed) => allowed !== channelType)),
    });
  };

  const allow = (event: MouseEvent<HTMLButtonElement>, channelType: TabChannelType) => {
    const allowed = [...installation.channelTypes, channelType];
    const reopened = reopening(tabs, 'lti_tab_type_not_allowed', [channelType]);
    if (!reopened.length) return update(allowed);
    openReopenConfirm(event.currentTarget, {
      id: `allow-lti-channel-type-${installation.id}-${channelType}`,
      installation,
      tabs: reopened,
      i18nKey: 'c:confirm.allow_lti_channel_type_tab',
      resource: t(`c:${channelType}`),
      label: 'c:allow',
      onConfirm: () => update(allowed),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="group-label text-xs">{t('c:lti_tab_channel_types')}</span>
      {tabChannelTypes.map((channelType) => {
        const allowed = installation.channelTypes.includes(channelType);
        const onChange = (event: MouseEvent<HTMLButtonElement>) => (allowed ? openWithdrawConfirm(event, channelType) : allow(event, channelType));
        return (
          <GrantRow key={channelType} label={t(`c:${channelType}`)} granted={allowed} grantLabel="c:allow" disabled={isPending} onChange={onChange} />
        );
      })}
      {!installation.channelTypes.length && (
        <p className="text-sm">{t(tabs.length ? 'c:lti_tab_channel_types.none_closed' : 'c:lti_tab_channel_types.none')}</p>
      )}
      <p className="text-muted-foreground text-sm">{t('c:lti_tab_channel_types.text')}</p>
    </div>
  );
}

/** Where the tabs of an LTI tool are, which go with it: one named, many listed with their channel's type. */
function DeletedTabs({ tabs }: { tabs: LtiInstallationTab[] }) {
  const { t } = useTranslation();
  if (!tabs.length) return <p>{t('c:lti_tool_delete.no_tabs')}</p>;
  if (tabs.length === 1)
    return (
      <p>
        <NamedText i18nKey="c:lti_tool_delete.tab" name={tabs[0].channelName} />
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p>{t('c:lti_tool_delete.tab_counted', { count: tabs.length })}</p>
      <ul className="flex flex-col gap-1">
        {tabs.map((tab) => (
          <li key={tab.id} className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-medium">{tab.channelName}</span>
            <span className="text-muted-foreground">{t(`c:${tab.channelType}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What deleting an LTI tool takes along, read before the person confirms: its tabs, and what it was shared or granted. */
function DeleteLtiToolForm({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { data } = useQuery(ltiInstallationTabsQueryOptions(path, installation.id));
  const { mutate: remove, isPending } = useDeleteLtiInstallationMutation();
  const close = () => dialoger.getState().remove(deleteDialogId(installation));

  return (
    <div className="flex flex-col gap-4 text-sm">
      {data && <DeletedTabs tabs={data.results} />}
      {(installation.releasedFields.length > 0 || installation.grantedScopes.length > 0) && <p>{t('c:lti_tool_delete.access')}</p>}
      <DeleteForm
        resource="c:lti_tool"
        pending={isPending}
        onCancel={close}
        onDelete={() =>
          remove(
            { path: { ...path, ltiInstallationId: installation.id } },
            {
              onSuccess: () => {
                close();
                toaster.success(t('c:success.delete_resource', { resource: t('c:lti_tool') }));
              },
            },
          )
        }
      />
    </div>
  );
}

interface LtiInstallationTileProps {
  installation: LtiInstallation;
  organization: EnrichedOrganization;
  /** Another LTI tool of the list carries the same name: the tile shows what tells them apart. */
  sharesName?: boolean;
}

/**
 * One installed LTI tool: a waiting one is approved or rejected, an approved one disabled or enabled and deleted for good,
 * with where it has tabs.
 */
export function LtiInstallationTile({ installation, organization, sharesName = false }: LtiInstallationTileProps) {
  const { t } = useTranslation();
  const approveRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  // Rejecting a waiting LTI tool deletes it, as deleting does in any state
  const { mutate: reject } = useDeleteLtiInstallationMutation();
  const { mutate: setStatus, isPending: settingStatus } = useSetLtiInstallationStatusMutation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const isPending = installation.status === 'pending';
  const pages = ltiToolPages(t, installation);
  const { data: tabs } = useQuery({ ...ltiInstallationTabsQueryOptions(path, installation.id), enabled: installation.status === 'disabled' });

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
      onConfirm: () =>
        reject(
          { path: { ...path, ltiInstallationId: installation.id } },
          { onSuccess: () => toaster.success(t('c:success.reject_lti_tool', { name: installation.name })) },
        ),
    });

  const toggleStatus = (event: MouseEvent<HTMLButtonElement>) => {
    const status = installation.status === 'active' ? 'disabled' : 'active';
    const setTo = () => setStatus({ path: { ...path, serviceAccountId: installation.id }, body: { status } });
    if (status === 'disabled') return setTo();
    // While its tabs are not read yet, or could not be, enabling asks without a count
    if (!tabs) {
      return openConfirm(event.currentTarget, {
        id: `enable-lti-tool-${installation.id}`,
        title: <NamedText i18nKey="c:confirm.enable_lti_tool" name={installation.name} />,
        label: 'c:enable',
        icon: CheckIcon,
        onConfirm: setTo,
      });
    }
    const reopened = reopening(tabs.results, 'lti_installation_not_active', installation.channelTypes);
    if (!reopened.length) return setTo();
    openReopenConfirm(event.currentTarget, {
      id: `enable-lti-tool-${installation.id}`,
      installation,
      tabs: reopened,
      i18nKey: 'c:confirm.enable_lti_tool_tab',
      label: 'c:enable',
      onConfirm: setTo,
    });
  };

  const openDeleteDialog = () =>
    dialoger.getState().create(<DeleteLtiToolForm installation={installation} path={path} />, {
      id: deleteDialogId(installation),
      triggerRef: deleteRef,
      className: 'md:max-w-xl',
      title: t('c:delete_resource', { resource: t('c:lti_tool') }),
      description: <NamedText i18nKey="c:confirm.delete_lti_tool" name={installation.name} />,
    });

  return (
    <ExpandableTile
      value={installation.id}
      icon={<BlocksIcon />}
      title={installation.name}
      badges={sharesName && <LtiToolOrigin createdAt={installation.createdAt} />}
      status={{ tone: statusTones[installation.status], label: t(statusLabels[installation.status]) }}
      meta={installation.launchOrigins.map((origin) => new URL(origin).host).join(', ')}
      lead={
        !isPending && (
          <>
            <InstallationTabs installation={installation} path={path} />
            <InstallationChannelTypes installation={installation} path={path} />
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
          <ExpandableTileDetail label={t('c:key_set_origin')} wide>
            {installation.keySetOrigin}
          </ExpandableTileDetail>
          {pages.length > 0 && (
            <ExpandableTileDetail label={t('c:lti_tool_pages')}>
              <LtiToolPageLinks pages={pages} />
            </ExpandableTileDetail>
          )}
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
          <>
            <Button variant="secondary" size="sm" className="max-sm:w-full" loading={settingStatus} onClick={toggleStatus}>
              {installation.status === 'active' ? <PowerOffIcon /> : <PowerIcon />}
              {t(installation.status === 'active' ? 'c:disable' : 'c:enable')}
            </Button>
            <Button ref={deleteRef} variant="secondary" size="sm" className="max-sm:w-full" onClick={openDeleteDialog}>
              <TrashIcon />
              {t('c:delete')}
            </Button>
          </>
        )
      }
    />
  );
}
