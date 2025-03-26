import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { type InviteMemberProps, inviteMembers } from '~/modules/memberships/api';
import { type SystemInviteProps, invite as inviteSystem } from '~/modules/system/api';

import { config } from 'config';
import { Send } from 'lucide-react';
import type { UseFormProps } from 'react-hook-form';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import SelectRoleRadio from '~/modules/common/form-fields/select-role-radio';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toaster } from '~/modules/common/toaster';
import type { EntityPage } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { queryClient } from '~/query/query-client';
import { membersKeys } from '../memberships/query/options';
import { organizationsKeys } from '../organizations/query';

interface Props {
  entity?: EntityPage;
  dialog?: boolean;
  children?: React.ReactNode;
}

/**
 * Add new invites to the organization count and invalidate the invites table query.
 */
export const handleNewInvites = (emails: string[], entity: EntityPage) => {
  queryClient.setQueryData(organizationsKeys.single.byIdOrSlug(entity.slug), (oldEntity: EntityPage) => {
    if (!oldEntity) return oldEntity;

    return {
      ...oldEntity,
      counts: {
        ...oldEntity.counts,
        membership: {
          ...oldEntity.counts?.membership,
          pending: (oldEntity.counts?.membership?.pending ?? 0) + emails.length,
        },
      },
    };
  });
  queryClient.invalidateQueries({
    queryKey: membersKeys.table.pending({ idOrSlug: entity.slug, entityType: entity.entity, orgIdOrSlug: entity.organizationId || entity.id }),
  });
};

/**
 * Form for inviting users by email.
 */
const InviteEmailForm = ({ entity, dialog: isDialog, children }: Props) => {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const formSchema = z.object({
    emails: z
      .array(z.string().email(t('common:invalid.email')))
      .min(1, { message: t('common:invalid.min_items', { items_count: 'one', item: 'email' }) }),
    role: z.enum(config.rolesByType.allRoles),
    idOrSlug: z.string().optional(),
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

  const formContainerId = 'invite-users';
  const form = useFormWithDraft<FormValues>(`invite-users${entity ? `-${entity?.id}` : ''}`, { formOptions, formContainerId });

  // It uses inviteSystem if no entity type is provided
  const { mutate: invite, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      if (!entity) return inviteSystem(values as SystemInviteProps);
      return inviteMembers({
        ...values,
        idOrSlug: entity.id,
        entityType: entity.entity,
        orgIdOrSlug: entity.organizationId || entity.id,
      } as InviteMemberProps);
    },
    onSuccess: (_, { emails }) => {
      form.reset(undefined, { keepDirtyValues: true });

      if (isDialog) useDialoger.getState().remove();
      toaster(t('common:success.user_invited'), 'success');
      if (entity) handleNewInvites(emails, entity);

      // Since this form is also used in onboarding, we need to call the next step
      // This should ideally be done through the callback, but we need to refactor stepper
      nextStep?.();
    },
  });

  const onSubmit = (values: FormValues) => {
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
                <SelectEmails placeholder={t('common:add_email')} emails={value} onChange={onChange} autoComplete="off" />
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
                <SelectRoleRadio value={value} entityType={entity?.entity} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && <Badge context="button">{form.getValues('emails')?.length}</Badge>}{' '}
            <Send size={16} className="mr-2" />
            {t('common:invite')}
          </SubmitButton>
          {children}

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
