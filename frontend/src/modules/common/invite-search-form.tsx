import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { invite } from '~/api/general';
import type { Organization } from '~/types';

import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getSuggestions } from '~/api/general';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import MultipleSelector from '../ui/multiple-selector';
import { Badge } from '../ui/badge';
import SelectRole from './select-role';
import { config } from 'config';

interface Props {
  organization?: Organization;
  callback?: () => void;
  dialog?: boolean;
  roles: { key: string; value: string }[];
}

const optionSchema = z.object({
  label: z.string(),
  value: z.string().email('Invalid email'),
  disable: z.boolean().optional(),
});

const formSchema = z.object({
  emails: z.array(optionSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

const InviteSearchForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();

  const form = useFormWithDraft<FormValues>('invite-users', {
    resolver: zodResolver(formSchema),
  });

  // TODO, make dynamic and type safe, for now it's hardcoded
  const roles = config.rolesByType[organization ? 'organization' : 'system'];

  const onSubmit = (values: FormValues) => {
    apiWrapper(
      () =>
        invite(
          values.emails.map((e) => e.value),
          organization?.id,
        ),
      () => {
        form.reset(undefined, { keepDirtyValues: true });
        callback?.();

        if (isDialog) {
          dialog.remove();
        }

        toast.success(t('common:success.user_invited'));
      },
    );
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
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <MultipleSelector
                  value={field.value}
                  onChange={field.onChange}
                  onSearch={async (query) => {
                    const users = await getSuggestions(query, 'user');

                    return users.map((u) => ({
                      label: u.name || u.email,
                      value: u.email,
                    }));
                  }}
                  hidePlaceholderWhenSelected
                  loadingIndicator={<Loader2 className="animate-spin" size={16} />}
                  defaultOptions={[]}
                  placeholder={t('common:search_users')}
                  emptyIndicator={t('common:no_users_found')}
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
            <FormItem>
              <FormLabel>{t('common:role')}</FormLabel>
              <FormControl>
                <SelectRole roles={roles} value={value} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" loading={pending} className="relative">
            {form.getValues('emails')?.length && (
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
