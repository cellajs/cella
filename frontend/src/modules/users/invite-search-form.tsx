import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { type InviteMemberProps, inviteMembers } from '~/modules/memberships/api';

import { config } from 'config';
import { Send } from 'lucide-react';
import { useMemo } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import SelectRoleRadio from '~/modules/common/form-fields/select-role-radio';
import { QueryCombobox } from '~/modules/common/query-combobox';
import { toaster } from '~/modules/common/toaster';
import type { EntityPage } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

interface Props {
  entity?: EntityPage;
  callback?: (emails: string[]) => void;
  dialog?: boolean;
}

// Invite members by searching for users which are already in the system
const InviteSearchForm = ({ entity, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  if (!entity) return null;

  const formSchema = z.object({
    emails: z
      .array(z.string().email(t('common:invalid.email')))
      .min(1, { message: t('common:invalid.min_items', { items_count: 'one', item: 'email' }) }),
    role: z.enum(config.rolesByType.entityRoles).optional(),
    idOrSlug: z.string().optional(),
  });

  type FormValues = z.infer<typeof formSchema>;

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        emails: [],
        role: 'member',
      },
    }),
    [],
  );

  const formContainerId = 'invite-users';
  const form = useFormWithDraft<FormValues>(`invite-users${entity ? `-${entity?.id}` : ''}`, { formOptions, formContainerId });

  const { mutate: invite, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      return inviteMembers({
        ...values,
        idOrSlug: entity.id,
        entityType: entity.entity || 'organization',
        orgIdOrSlug: entity.organizationId || entity.id,
      } as InviteMemberProps);
    },
    onSuccess: (_, { emails }) => {
      form.reset(undefined, { keepDirtyValues: true });
      if (isDialog) useDialoger.getState().remove();
      toaster(t('common:success.user_invited'), 'success');
      callback?.(emails);
    },
  });

  const onSubmit = (values: FormValues) => {
    invite(values);
  };

  if (form.loading) return null;
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <FormControl>
                <QueryCombobox value={value} onChange={onChange} entityId={entity.id} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="flex-row gap-4 items-center">
              <FormLabel>{t('common:role')}:</FormLabel>
              <FormControl>
                <SelectRoleRadio entityType={entity.entity} value={value} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && <Badge context="button">{form.getValues('emails')?.length}</Badge>}
            <Send size={16} className="mr-2" />
            {t('common:invite')}
          </SubmitButton>
          {form.formState.isDirty && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default InviteSearchForm;
