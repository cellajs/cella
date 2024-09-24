import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { type SystemInviteProps, invite as inviteSystem } from '~/api/general';
import { type InviteMemberProps, inviteMembers } from '~/api/memberships';

import { onlineManager } from '@tanstack/react-query';
import { idOrSlugSchema } from 'backend/lib/common-schemas';
import { config } from 'config';
import { Send } from 'lucide-react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { showToast } from '~/lib/taosts-show';
import { dialog } from '~/modules/common/dialoger/state';
import SelectRole from '~/modules/common/form-fields/select-role-radio';
import { MultiEmail } from '~/modules/common/multi-email';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import type { EntityPage } from '~/types/common';

interface Props {
  entity?: EntityPage;
  callback?: () => void;
  dialog?: boolean;
  children?: React.ReactNode;
}

// When no entity type, it's a system invite
const InviteEmailForm = ({ entity, callback, dialog: isDialog, children }: Props) => {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const formSchema = z.object({
    emails: z
      .array(z.string().email(t('backend:invalid.email')))
      .min(1, { message: t('backend:invalid.min_items', { items_count: 'one', item: 'email' }) }),
    role: z.enum(config.rolesByType.allRoles),
    idOrSlug: idOrSlugSchema.optional(),
  });

  type FormValues = z.infer<typeof formSchema>;

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        emails: [],
        role: entity ? 'member' : 'user',
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>(`invite-users${entity ? `-${entity?.id}` : ''}`, formOptions);

  // It uses inviteSystem if no entity type is provided
  const { mutate: invite, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      if (!entity) return inviteSystem(values as SystemInviteProps);
      return inviteMembers({
        ...values,
        idOrSlug: entity.id,
        entityType: entity.entity,
        organizationId: entity.organizationId || entity.id,
      } as InviteMemberProps);
    },
    onSuccess: () => {
      form.reset(undefined, { keepDirtyValues: true });
      nextStep?.();
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
                <MultiEmail placeholder={t('common:add_email')} emails={value} onChange={onChange} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="flex-row ml-3 gap-4 items-center">
              <FormLabel>{t('common:role')}</FormLabel>
              <FormControl>
                <SelectRole value={value} entityType={entity?.entity} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          {children}
          <Button type="submit" loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{form.getValues('emails')?.length}</Badge>
            )}{' '}
            <Send size={16} className="mr-2" />
            {t('common:invite')}
          </Button>
          {!children && form.formState.isDirty && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default InviteEmailForm;
