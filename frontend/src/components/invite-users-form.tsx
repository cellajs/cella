import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { invite } from '~/api/general';
import { Organization } from '~/types';

import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { dialog } from '~/components/dialoger/state';
import { Button } from '~/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import MultipleSelector, { Option } from './ui/multiple-selector';

interface Props {
  organization?: Organization;
  callback?: () => void;
  dialog?: boolean;
}

const OPTIONS: Option[] = [];

const optionSchema = z.object({
  label: z.string(),
  value: z.string().email('Invalid email'),
  disable: z.boolean().optional(),
});

const formSchema = z.object({
  emails: z.array(optionSchema).min(1),
});

type FormValues = z.infer<typeof formSchema>;

const InviteUsersForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();

  const form = useFormWithDraft<FormValues>('invite-users', {
    resolver: zodResolver(formSchema),
  });

  const onSubmit = (values: FormValues) => {
    apiWrapper(
      () =>
        invite(
          values.emails.map((e) => e.value),
          organization?.id,
        ),
      () => {
        form.reset(values);
        callback?.();

        if (isDialog) {
          dialog.remove();
        }

        toast.success(
          t('success.user_invited', {
            defaultValue: 'Users invited',
          }),
        );
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
              <FormLabel>
                {t('label.emails', {
                  defaultValue: 'Emails',
                })}
              </FormLabel>
              <FormControl>
                <MultipleSelector
                  value={field.value}
                  onChange={field.onChange}
                  creatable
                  creatablePlaceholder="Invite"
                  defaultOptions={OPTIONS}
                  placeholder="Type emails ..."
                  // emptyIndicator={<p className="text-center text-lg leading-10 text-gray-600 dark:text-gray-400">no results found.</p>}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" loading={pending}>
            <Send size={16} className="mr-2" />
            {t('action.invite', {
              defaultValue: 'Invite',
            })}
          </Button>
          {form.formState.isDirty && (
            <Button variant="secondary" onClick={cancel}>
              {t('action.cancel', {
                defaultValue: 'Cancel',
              })}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default InviteUsersForm;
