import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { invite } from '~/api/general';
import type { Organization } from '~/types';

import { config } from 'config';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Badge } from '../ui/badge';
import { MultiEmail } from './multi-email';
import SelectRole from './select-role';

interface Props {
  organization?: Organization;
  callback?: () => void;
  dialog?: boolean;
}

const formSchema = z.object({
  emails: z.array(z.string().email('Invalid email')).min(1),
  role: z.enum(['ADMIN', 'USER', 'MEMBER']).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const InviteEmailForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();

  const form = useFormWithDraft<FormValues>('invite-users', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      emails: [],
      role: config.rolesByType[organization ? 'organization' : 'system'][config.rolesByType[organization ? 'organization' : 'system'].length - 1].key,
    },
  });

  // TODO, make dynamic and type safe, for now it's hardcoded
  const roles = config.rolesByType[organization ? 'organization' : 'system'];

  const onSubmit = (values: FormValues) => {
    apiWrapper(
      () => invite(values.emails, values.role, organization?.id),
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
      </form>
    </Form>
  );
};

export default InviteEmailForm;
