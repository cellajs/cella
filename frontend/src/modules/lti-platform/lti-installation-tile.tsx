import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { BlocksIcon, CheckIcon, PlusIcon, PowerIcon, PowerOffIcon, XIcon } from 'lucide-react';
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
import {
  useApproveLtiInstallationMutation,
  useCreateLtiResourceLinkMutation,
  useDeleteLtiResourceLinkMutation,
  useRejectLtiInstallationMutation,
  useSetLtiInstallationStatusMutation,
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

const fieldLabels = { name: 'c:name', email: 'c:email', picture: 'c:profile_picture' } as const satisfies Record<PersonalField, string>;

const statusTones = { pending: 'warning', active: 'info', disabled: 'muted' } as const satisfies Record<LtiInstallation['status'], TileTone>;

const statusLabels = { pending: 'c:waiting_for_approval', active: 'c:active', disabled: 'c:disabled' } as const;

const approveDialogId = (installation: LtiInstallation) => `approve-lti-tool-${installation.id}`;

/** Personal fields as a reader sees them; none reads as the identifier a launch always carries. */
function FieldList({ fields }: { fields: PersonalField[] }) {
  const { t } = useTranslation();
  if (!fields.length) return t('c:identifier_only');
  return fields.map((field) => t(fieldLabels[field])).join(', ');
}

const approveSchema = zApproveLtiInstallationBody;

/** The fields the LTI tool asked for, as choices with none chosen: what an approval releases is the admin's act. */
function ApproveLtiToolForm({ installation, path }: { installation: LtiInstallation; path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate: approve, isPending } = useApproveLtiInstallationMutation();
  const form = useForm<z.infer<typeof approveSchema>>({ resolver: formResolver(approveSchema), defaultValues: { releasedFields: [] } });

  const onSubmit = ({ releasedFields }: z.infer<typeof approveSchema>) =>
    approve(
      { path: { ...path, ltiInstallationId: installation.id }, body: { releasedFields } },
      { onSuccess: () => dialoger.getState().remove(approveDialogId(installation)) },
    );

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
      meta={installation.domain}
      lead={!isPending && <InstallationTabs installation={installation} organization={organization} links={resourceLinks} />}
      details={
        <>
          {installation.description && (
            <ExpandableTileDetail label={t('c:description')} wide>
              {installation.description}
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
          <Button variant="secondary" size="sm" className="max-sm:w-full" loading={settingStatus} onClick={toggleStatus}>
            {installation.status === 'active' ? <PowerOffIcon /> : <PowerIcon />}
            {t(installation.status === 'active' ? 'c:disable' : 'c:enable')}
          </Button>
        )
      }
    />
  );
}
