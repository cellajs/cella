import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, TrashIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Connection, Tenant } from 'sdk';
import { appConfig } from 'shared';
import { z } from 'zod';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { Switch } from '~/modules/ui/switch';
import { Textarea } from '~/modules/ui/textarea';

const federationKeys = Object.keys(appConfig.federations);
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

/**
 * A tenant's connections, for system admins: the institution connected through a federation, with its status, its
 * domains and IdP entity ids, the admission switch and the entry link; plus the form that connects one. One SSO
 * connection per tenant, so the form shows while the tenant has none.
 */
export function ConnectionsCard({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation();
  const { data: connections, isPending } = useQuery(connectionsQueryOptions(tenant.id));
  const { mutate: create, isPending: creating } = useConnectionCreateMutation();
  const { mutate: update } = useConnectionUpdateMutation();
  const { mutate: remove } = useConnectionDeleteMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { issuer: federationKeys[0] ?? '', displayName: '', claimValues: '', idpEntityIds: '' },
  });

  const onSubmit = (values: FormValues) => {
    create(
      {
        path: { tenantId: tenant.id },
        body: {
          issuer: values.issuer as never,
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

  const copyLink = async (connection: Connection) => {
    await navigator.clipboard.writeText(entryLink(connection));
    toaster.success(t('c:copied'));
  };

  if (isPending) return <Spinner className="size-6" />;

  const sso = (connections ?? []).filter((connection) => connection.kind === 'sso');

  return (
    <div className="flex flex-col gap-6 text-sm">
      <p className="text-muted-foreground">{t('c:connections.text')}</p>

      {sso.map((connection) => (
        <div key={connection.id} className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{connection.displayName}</span>
            <Badge variant="outline">
              {appConfig.federations[connection.issuer as keyof typeof appConfig.federations]?.label ?? connection.issuer}
            </Badge>
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
            <span>
              {t('c:claim_values')}: {connection.claimValues.join(', ')}
            </span>
            <span className="break-all">
              {t('c:idp_entity_ids')}: {(connection.config.idpEntityIds ?? []).join(', ')}
            </span>
          </div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the Base UI switch renders the hidden input this label wraps */}
          <label className="flex items-center gap-3">
            <Switch
              checked={connection.jitProvisioning}
              onCheckedChange={(jitProvisioning) => update({ path: { tenantId: tenant.id, id: connection.id }, body: { jitProvisioning } })}
            />
            <span>
              {t('c:jit_provisioning')} <span className="text-muted-foreground">{t('c:jit_provisioning.text')}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="plain" size="sm" onClick={() => copyLink(connection)}>
              <CopyIcon />
              {t('c:sso_entry_link')}
            </Button>
            <span className="text-muted-foreground">{t('c:sso_entry_link.text')}</span>
            <Button
              type="button"
              variant="plain"
              size="sm"
              className="ml-auto text-destructive"
              onClick={() => remove({ path: { tenantId: tenant.id, id: connection.id } })}
            >
              <TrashIcon />
              {t('c:delete')}
            </Button>
          </div>
        </div>
      ))}

      {sso.length === 0 && federationKeys.length > 0 && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="issuer"
              render={({ field }) => (
                <FormItem name="issuer">
                  <FormLabel>{t('c:federation')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={federationKeys.map((key) => ({
                      value: key,
                      label: appConfig.federations[key as keyof typeof appConfig.federations].label,
                    }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {federationKeys.map((key) => (
                        <SelectItem key={key} value={key}>
                          {appConfig.federations[key as keyof typeof appConfig.federations].label}
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
                  <FormLabel>{t('c:claim_values')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="uu.nl, students.uu.nl" />
                  </FormControl>
                  <p className="text-muted-foreground">{t('c:claim_values.text')}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="idpEntityIds"
              render={({ field }) => (
                <FormItem name="idpEntityIds">
                  <FormLabel>{t('c:idp_entity_ids')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="https://login.uu.nl/nidp/saml2/metadata" />
                  </FormControl>
                  <p className="text-muted-foreground">{t('c:idp_entity_ids.text')}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SubmitButton loading={creating} className="self-start">
              {t('c:create_resource', { resource: t('c:connection').toLowerCase() })}
            </SubmitButton>
          </form>
        </Form>
      )}
    </div>
  );
}
