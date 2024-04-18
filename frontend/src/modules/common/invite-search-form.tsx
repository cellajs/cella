import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { invite as baseInvite } from '~/api/general';
import type { Organization } from '~/types';

import { config } from 'config';
import { Send } from 'lucide-react';
import { useMemo } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { toast } from 'sonner';
import { getSuggestions } from '~/api/general';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Badge } from '../ui/badge';
import SelectRole from './form-fields/select-role';
import MultipleSelector from './multi-select';

interface Props {
  organization?: Organization | null;
  type?: 'system' | 'organization';
  callback?: () => void;
  dialog?: boolean;
}

const formSchema = z.object({
  emails: z.array(z.string().email('Invalid email')).min(1),
  role: z.enum(['ADMIN', 'USER', 'MEMBER']).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const InviteSearchForm = ({ organization, type = 'system', callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

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
      idOrSlug: organization?.id,
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
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormControl>
                <MultipleSelector
                  value={value.map((v) => ({ label: v, value: v }))}
                  onChange={(options) => onChange(options.map((o) => o.value))}
                  onSearch={async (query) => {
                    const data = await getSuggestions(query, 'user');

                    return data.users.map((u) => ({
                      label: u.name || u.email,
                      value: u.email,
                    }));
                  }}
                  basicSignValue={t('common:invite_members_search.text')}
                  hidePlaceholderWhenSelected
                  defaultOptions={[]}
                  placeholder={t('common:search_users')}
                  emptyValue={t('common:no_users_found')}
                />
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
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{form.getValues('emails')?.length}</Badge>
            )}
            <Send size={16} className="mr-2" />
            {t('common:invite')}
          </Button>
          {form.formState.isDirty && (
            <Button type="reset" variant="secondary" onClick={cancel}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default InviteSearchForm;
