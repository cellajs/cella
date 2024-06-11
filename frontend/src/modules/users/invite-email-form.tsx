import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { type InviteSystemProps, invite as inviteSystem } from '~/api/general';
import { type InviteMemberProps, inviteMember } from '~/api/memberships';

import { idSchema, slugSchema } from 'backend/lib/common-schemas';
import { config } from 'config';
import { Send } from 'lucide-react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import SelectRole from '~/modules/common/form-fields/select-role-radio';
import { MultiEmail } from '~/modules/common/multi-email';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import type { ContextEntity } from '~/types';

interface Props {
  entityId?: string;
  entityType?: ContextEntity;
  callback?: () => void;
  dialog?: boolean;
  children?: React.ReactNode;
}

const formSchema = z.object({
  emails: z.array(z.string().email('Invalid email')).min(1),
  role: z.enum(config.rolesByType.allRoles),
  idOrSlug: idSchema.or(slugSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

// When no entity type, it's a system invite
const InviteEmailForm = ({ entityId, entityType, callback, dialog: isDialog, children }: Props) => {
  if (entityType && !entityId) console.error('entityId is required when entityType is provided');

  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        emails: [],
        role: entityType ? 'MEMBER' : 'USER',
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('invite-users', formOptions);

  // It uses inviteSystem if no entity type is provided
  const { mutate: invite, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      if (!entityType) return inviteSystem(values as InviteSystemProps);
      return inviteMember(values as InviteMemberProps);
    },
    onSuccess: () => {
      form.reset(undefined, { keepDirtyValues: true });
      callback?.();
      nextStep?.();
      if (isDialog) dialog.remove();
      toast.success(t('common:success.user_invited'));
    },
  });

  const onSubmit = (values: FormValues) => {
    invite({
      ...values,
      idOrSlug: entityId,
    });
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
                <SelectRole value={value} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          {children}
          <Button type="submit" loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{form.getValues('emails')?.length}</Badge>
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
