import { zodResolver } from '@hookform/resolvers/zod';
import { appConfig } from 'config';
import { Send } from 'lucide-react';
import { useMemo } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { systemInvite as baseSystemInvite } from '~/api.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import SelectRoleRadio from '~/modules/common/form-fields/select-role-radio';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toaster } from '~/modules/common/toaster/service';
import type { EntityPage } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import type { InviteMember } from '~/modules/memberships/types';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

interface Props {
  entity?: EntityPage;
  dialog?: boolean;
  children?: React.ReactNode;
}

/**
 * Form for inviting users by email.
 */
const InviteEmailForm = ({ entity, dialog: isDialog, children }: Props) => {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const formSchema = z.object({
    emails: z.array(z.email(t('common:invalid.email'))).min(1, { message: t('common:invalid.min_items', { items_count: 'one', item: 'email' }) }),
    role: z.enum(appConfig.rolesByType.entityRoles).optional(),
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

  const onSuccess = (
    { invitesSentCount, rejectedItems }: { rejectedItems: string[]; invitesSentCount: number },
    { emails }: { emails: string[] },
  ) => {
    form.reset(undefined, { keepDirtyValues: true });
    if (isDialog) useDialoger.getState().remove();

    if (invitesSentCount > 0) {
      const resource = t(`common:${invitesSentCount === 1 ? 'user' : 'users'}`).toLowerCase();
      toaster(t('common:success.resource_count_invited', { count: invitesSentCount, resource }), 'success');
    }
    if (rejectedItems.length) toaster(t('common:still_not_accepted', { count: rejectedItems.length, total: emails.length }), 'info');

    // Since this form is also used in onboarding, we need to call the next step
    // This should ideally be done through the callback, but we need to refactor stepper
    nextStep?.();
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: FormValues) => baseSystemInvite({ body }),
    onSuccess,
  });

  const onSubmit = (values: FormValues) => {
    entity ? membershipInvite({ ...values, entity } as InviteMember, { onSuccess }) : systemInvite(values);
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
        {entity && (
          <FormField
            control={form.control}
            name="role"
            render={({ field: { value, onChange } }) => (
              <FormItem className="flex-row ml-3 gap-4 items-center">
                <FormLabel>{t('common:role')}</FormLabel>
                <FormControl>
                  <SelectRoleRadio value={value} entityType={entity?.entityType} onChange={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton loading={isPending || isSystemInvitePending} className="relative">
            {!!form.getValues('emails')?.length && <Badge context="button">{form.getValues('emails')?.length}</Badge>}{' '}
            <Send size={16} className="mr-2" />
            {t('common:invite')}
          </SubmitButton>
          {children}

          {!children && form.isDirty && (
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
