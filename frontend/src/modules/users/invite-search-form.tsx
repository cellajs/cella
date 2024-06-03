import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { inviteMember, type InviteMemberProps } from '~/api/memberships';
import { invite as inviteSystem, type InviteSystemProps } from '~/api/general';
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
import SelectRole from '~/modules/common/form-fields/select-role-radio';
import MultipleSelector from '~/modules/common/multi-select';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { idSchema, slugSchema } from 'backend/lib/common-schemas';

interface Props {
  organization?: Organization | null;
  type?: 'system' | 'organization';
  callback?: () => void;
  dialog?: boolean;
}

const formSchema = z.object({
  emails: z.array(z.string().email('Invalid email')).min(1),
  role: z.enum(['USER', 'MEMBER', 'ADMIN']).optional(),
  idOrSlug: idSchema.or(slugSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const InviteSearchForm = ({ organization, type = 'system', callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: {
        emails: [],
        role: config.rolesByType[type][0].key,
      },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('invite-users', formOptions);

  const { mutate: invite, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      if (type === 'system') return inviteSystem(values as InviteSystemProps);
      return inviteMember(values as InviteMemberProps);
    },
    onSuccess: () => {
      form.reset(undefined, { keepDirtyValues: true });
      callback?.();
      if (isDialog) dialog.remove();
      toast.success(t('common:success.user_invited'));
    },
  });

  // TODO, make dynamic and type safe, for now it's hardcoded
  const roles = config.rolesByType[type];

  const onSubmit = (values: FormValues) => {
    invite({
      ...values,
      idOrSlug: organization?.id,
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
                <MultipleSelector
                  formControlName="emails"
                  value={value ? value.map((val: string) => ({ label: val, value: val })) : []}
                  onChange={(options) => onChange(options.map((o) => o.value))}
                  onSearch={async (query) => {
                    const data = await getSuggestions(query, 'USER');
                    if (data.entities.length > 0) {
                      return data.entities.map((u) => ({
                        label: u.name || u.email || '',
                        value: u.email || '',
                      }));
                    }
                    return [];
                  }}
                  basicSignValue={t('common:invite_members_search.text', { appName: config.name })}
                  hidePlaceholderWhenSelected
                  defaultOptions={value ? value.map((val: string) => ({ label: val, value: val })) : []}
                  placeholder={t('common:search_users')}
                  emptyValue={t('common:no_resource_found', { resource: t('common:users').toLowerCase() })}
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
              <FormLabel>{t('common:role')}:</FormLabel>
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
