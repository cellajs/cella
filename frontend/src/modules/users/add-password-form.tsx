import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { ArrowRight } from 'lucide-react';

const formSchema = z.object({
  password: z.string().min(8),
});

const AddPasswordForm = () => {
  const { t } = useTranslation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = (_values: z.infer<typeof formSchema>) => {
    // TODO: Add password logic
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 !mt-0">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem className="gap-0">
              <FormControl>
                <Input type="password" autoFocus {...field} autoComplete="current-password" placeholder={t('common:password')} />
              </FormControl>
              <FormMessage className="mt-2" />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          {t('common:sign_in')}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
    </Form>
  );
};

export default AddPasswordForm;
