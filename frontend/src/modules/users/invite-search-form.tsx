import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { type InviteMemberProps, inviteMembers } from '~/api/memberships';

import { onlineManager } from '@tanstack/react-query';
import { idOrSlugSchema } from 'backend/utils/schema/common-schemas';
import { config } from 'config';
import { Send } from 'lucide-react';
import { useMemo } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { showToast } from '~/lib/toasts';
import { dialog } from '~/modules/common/dialoger/state';
import SelectRole from '~/modules/common/form-fields/select-role-radio';
import { QueryCombobox } from '~/modules/common/query-combobox';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import type { EntityPage } from '~/types/common';

interface Props {
  entity?: EntityPage;
  callback?: () => void;
  dialog?: boolean;
}

// Invite members by seaching for users which are already in the system
const InviteSearchForm = ({ entity, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  if (!entity) return null;

  const formSchema = z.object({
    emails: z
      .array(z.string().email(t('backend:invalid.email')))
      .min(1, { message: t('backend:invalid.min_items', { items_count: 'one', item: 'email' }) }),
    role: z.enum(config.rolesByType.entityRoles).optional(),
    idOrSlug: idOrSlugSchema.optional(),
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

  const form = useFormWithDraft<FormValues>(`invite-users${entity ? `-${entity?.id}` : ''}`, formOptions);

  const { mutate: invite, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      return inviteMembers({
        ...values,
        idOrSlug: entity.id,
        entityType: entity.entity || 'organization',
        organizationId: entity.organizationId || entity.id,
      } as InviteMemberProps);
    },
    onSuccess: () => {
      form.reset(undefined, { keepDirtyValues: true });
      if (isDialog) dialog.remove();
      showToast(t('common:success.user_invited'), 'success');
      callback?.();
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    invite(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <FormControl>
                <QueryCombobox value={value} onChange={onChange} />
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
                <SelectRole entityType={entity.entity} value={value} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{form.getValues('emails')?.length}</Badge>
            )}
            <Send size={16} className="mr-2" />
            {t('common:invite')}
          </Button>
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
