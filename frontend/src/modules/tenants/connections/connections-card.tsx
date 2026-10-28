import { useQuery } from '@tanstack/react-query';
import { CopyIcon, TrashIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Connection, CreateConnectionData, Tenant } from 'sdk';
import { appConfig } from 'shared';
import { z } from 'zod';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { HelpText } from '~/modules/common/help-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { DeleteQuestion } from '~/modules/common/popconfirm';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import {
  connectionsQueryOptions,
  useConnectionCreateMutation,
  useConnectionDeleteMutation,
  useConnectionUpdateMutation,
} from '~/modules/tenants/query';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { Switch } from '~/modules/ui/switch';
import { Textarea } from '~/modules/ui/textarea';
import { formResolver } from '~/utils/form-resolver';

const federationItems = Object.entries(appConfig.federations).map(([value, { label }]) => ({ value, label }));
const statuses = ['pending', 'active', 'disabled'] as const;

/** The form collects lists as text; the request body gets arrays. */
const formSchema = z.object({
  issuer: z.string().min(1),
  displayName: z.string().trim().min(2).max(100),
  claimValues: z.string().trim().min(1),
  idpEntityIds: z.string().trim().min(1),
});
type FormValues = z.infer<typeof formSchema>;

const splitList = (value: string, separator: RegExp) =>
  value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);

/** The link an institution shares with its members: the entry page of its connection. */
const entryLink = (connection: Connection) => `${appConfig.frontendUrl}/auth/sso/${connection.id}`;

interface ConnectionsCardProps {
  tenant: Tenant;
  className?: string;
}

/** A tenant's SSO connection for system admins, and the form that adds one while the tenant has none. */
export function ConnectionsCard({ tenant, className }: ConnectionsCardProps) {
  const { t } = useTranslation();
  const { data: connections, isPending } = useQuery(connectionsQueryOptions(tenant.id));
  const { mutate: create, isPending: creating } = useConnectionCreateMutation();
  const { mutate: update } = useConnectionUpdateMutation();
  const { mutate: remove } = useConnectionDeleteMutation();
  const { copied, copyToClipboard } = useCopyToClipboard();

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { issuer: federationItems[0]?.value ?? '', displayName: '', claimValues: '', idpEntityIds: '' },
  };

  const formContainerId = 'tenant-connections';
  const form = useFormWithDraft<FormValues>(`create-connection-${tenant.id}`, { formOptions, formContainerId });

  const onSubmit = (values: FormValues) => {
    create(
      {
        path: { tenantId: tenant.id },
        body: {
          // The select offers only appConfig.federations keys; the form keeps the value a string so its default can be empty.
          issuer: values.issuer as CreateConnectionData['body']['issuer'],
          displayName: values.displayName,
          claimValues: splitList(values.claimValues, /[,\s]+/),
          idpEntityIds: splitList(values.idpEntityIds, /\n+/),
        },
      },
      {
        onSuccess: () => {
          form.reset();
          toaster.success(t('c:success.create_resource', { resource: t('c:connection') }));
        },
      },
    );
  };

  // A deleted connection ends its institution's sign-in, so the click asks first.
  const openDeleteConfirm = (connection: Connection, event: MouseEvent<HTMLButtonElement>) =>
    openConfirm(event.currentTarget, {
      id: `delete-connection-${connection.id}`,
      title: <DeleteQuestion resource="c:connection" name={connection.displayName} />,
      onConfirm: () => remove({ path: { tenantId: tenant.id, id: connection.id } }),
    });

  const ssoConnections = (connections ?? []).filter((connection) => connection.kind === 'sso');

  return (
    <ToolCard label="c:connection_other" description={t('c:connections.text')} unsaved id={formContainerId} className={className}>
      {isPending ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6 text-sm">
          {ssoConnections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{connection.displayName}</span>
                <Badge variant="outline">{federationItems.find((item) => item.value === connection.issuer)?.label ?? connection.issuer}</Badge>
                <Select
                  value={connection.status}
                  onValueChange={(status) =>
                    update({ path: { tenantId: tenant.id, id: connection.id }, body: { status: status as Connection['status'] } })
                  }
                  items={statuses.map((status) => ({ value: status, label: t(`c:${status}`) }))}
                >
                  <SelectTrigger className="ml-auto w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`c:${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1 text-muted-foreground">
                <span className="wrap-anywhere">
                  {t('c:claim_values')}: {connection.claimValues.join(', ')}
                </span>
                <span className="break-all">
                  {t('c:idp_entity_ids')}: {(connection.config.idpEntityIds ?? []).join(', ')}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Switch
                  id={`jit-provisioning-${connection.id}`}
                  checked={connection.jitProvisioning}
                  onCheckedChange={(jitProvisioning) => update({ path: { tenantId: tenant.id, id: connection.id }, body: { jitProvisioning } })}
                />
                <HelpText content={t('c:jit_provisioning.text')}>
                  <Label htmlFor={`jit-provisioning-${connection.id}`}>{t('c:jit_provisioning')}</Label>
                </HelpText>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <HelpText content={t('c:sso_entry_link.text')}>
                  <Button variant="secondary" size="sm" onClick={() => copyToClipboard(entryLink(connection))}>
                    <CopiedIcon copied={copied} icon={CopyIcon} />
                    {t('c:sso_entry_link')}
                  </Button>
                </HelpText>
                <Button variant="destructive" size="sm" className="ml-auto" onClick={(event) => openDeleteConfirm(connection, event)}>
                  <TrashIcon />
                  {t('c:delete')}
                </Button>
              </div>
            </div>
          ))}

          {ssoConnections.length === 0 && federationItems.length > 0 && (
            <Form {...form}>
              <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="issuer"
                  render={({ field }) => (
                    <FormItem name="issuer">
                      <FormLabel>{t('c:federation')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} items={federationItems}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {federationItems.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem name="displayName">
                      <FormLabel>{t('c:institution_name')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="claimValues"
                  render={({ field }) => (
                    <FormItem name="claimValues">
                      <FormLabel help={t('c:claim_values.text')}>{t('c:claim_values')}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="example.edu, students.example.edu" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="idpEntityIds"
                  render={({ field }) => (
                    <FormItem name="idpEntityIds">
                      <FormLabel help={t('c:idp_entity_ids.text')}>{t('c:idp_entity_ids')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} placeholder="https://login.example.edu/saml2/metadata" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <SubmitButton disabled={!form.isDirty} loading={creating}>
                    {t('c:create_resource', { resource: t('c:connection') })}
                  </SubmitButton>
                  <CancelButton dirty={form.isDirty} onClick={() => form.reset()} />
                </div>
              </form>
            </Form>
          )}
        </div>
      )}
    </ToolCard>
  );
}
