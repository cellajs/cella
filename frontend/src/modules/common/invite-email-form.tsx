import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { invite as baseInvite } from '~/api/general';
import type { Organization } from '~/types';

import { config } from 'config';
import { Send } from 'lucide-react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Badge } from '../ui/badge';
import { useStepper } from '../ui/stepper';
import SelectRole from './form-fields/select-role';
import { MultiEmail } from './multi-email';

interface Props {
  organization?: Organization | null;
  type?: 'system' | 'organization';
  callback?: () => void;
  dialog?: boolean;
  children?: React.ReactNode;
}

const formSchema = z.object({
  emails: z.array(z.string().email('Invalid email')).min(1),
  role: z.enum(['ADMIN', 'USER', 'MEMBER']).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const InviteEmailForm = ({ organization, type = 'system', callback, dialog: isDialog, children }: Props) => {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        emails: [],
        role: config.rolesByType[type][config.rolesByType[type].length - 1].key,
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('invite-users', formOptions);

  const { mutate: invite, isPending } = useMutation({
    mutationFn: baseInvite,
    onSuccess: () => {
      form.reset(undefined, { keepDirtyValues: true });
      callback?.();

      nextStep?.();

      if (isDialog) {
        dialog.remove();
      }

      toast.success(t('common:success.user_invited'));
    },
  });

  // TODO, make dynamic and type safe, for now it's hardcoded
  const roles = config.rolesByType[type];

  const onSubmit = (values: FormValues) => {
    invite({
      emails: values.emails,
      role: values.role,
      organizationIdentifier: organization?.id,
    });
  };

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
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
                <MultiEmail placeholder={t('common:add_email')} emails={value} onChange={onChange} />
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
              <FormLabel>{t('common:role')}</FormLabel>
              <FormControl>
                <SelectRole roles={roles} value={value} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {children}
        {!children && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" loading={isPending} className="relative">
              {!!form.getValues('emails')?.length && (
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{form.getValues('emails')?.length}</Badge>
              )}{' '}
              <Send size={16} className="mr-2" />
              {t('common:invite')}
            </Button>
            {form.formState.isDirty && (
              <Button type="reset" variant="secondary" onClick={cancel}>
                {t('common:cancel')}
              </Button>
            )}
          </div>
        )}
      </form>
    </Form>
  );
};

export default InviteEmailForm;
