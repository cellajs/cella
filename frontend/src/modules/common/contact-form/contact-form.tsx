import { zodResolver } from '@hookform/resolvers/zod';
import { config } from 'config';

import { Mail, MessageSquare, Send, User } from 'lucide-react';
import { Control, FieldPath, FieldValues, SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { dialog } from '~/modules/common/dialoger/state';

import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

const ContactFormMap = lazy(() => import('./contact-form-map'));

interface CustomFormFieldProps<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  type?: string;
  icon?: JSX.ElementType;
}

const CustomFormField = <TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>({
  control,
  name,
  label,
  type,
  icon: IconComponent,
}: CustomFormFieldProps<TFieldValues, TName>) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel className="hidden sm:block">{label}</FormLabel>
          <FormControl>
            <div className="flex items-center">
              {IconComponent && <IconComponent className="mr-2" />}
              {type === 'textarea' ? <Textarea {...field} placeholder={label} /> : <Input {...field} type={type || 'text'} placeholder={label} />}
            </div>
          </FormControl>
          <FormMessage>{fieldState.error?.message}</FormMessage>
        </FormItem>
      )}
    />
  );
};

const formSchema = z.object({
  name: z.string().min(5, 'Name is required').default(''),
  email: z.string().email('Invalid email address').default(''),
  message: z.string().min(5, 'Message must be at least 5 characters long').default(''),
});

type FormData = z.infer<typeof formSchema>;

export async function submitContactForm(data: FormData) {
  try {
    const webhookUrl = config.contactWebhookUrl;
    let { name, email, message } = data;
    const app = config.slug;
    email = email.trim().toLowerCase();

    const queryParams = new URLSearchParams({ app, name, email }).toString();
    const response = await fetch(webhookUrl + queryParams, { method: 'POST', body: message });

    return response.ok;
  } catch (error) {
    console.error('Error in submitContactForm:', error);
    return false;
  }
}

// Main contact form map component
const ContactForm = ({ dialog: isDialog }: { dialog?: boolean }) => {
  const isMediumScreen = useBreakpoints('min', 'md');
  const { t } = useTranslation();

  const form = useFormWithDraft<FormData>('contact-form', {
    resolver: zodResolver(formSchema),
  });

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    const isSuccess = await submitContactForm(data);

    if (isSuccess) {
      toast.success('Message sent successfully!');
    } else {
      toast.error('Something went wrong, please try again later.');
    }
  };

  return (
    <div className="flex w-full gap-8 flex-col md:flex-row">
      <div className="w-full">
        <div className="w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-6">
              <CustomFormField control={form.control} name="name" label="Name" icon={User} />
              <CustomFormField control={form.control} name="email" label="Email" type="email" icon={Mail} />
              <CustomFormField control={form.control} name="message" label="Message" type="textarea" icon={MessageSquare} />

              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit">
                  <Send size={16} className="mr-2" />
                  {t('action.send')}
                </Button>
                <Button type="reset" variant="secondary" onClick={cancel} className={form.formState.isDirty ? '' : 'sm:invisible'}>
                  {t('action.cancel')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
      {isMediumScreen && (
        <Suspense>
          <div className="w-full">
            <ContactFormMap />
          </div>
        </Suspense>
      )}
    </div>
  );
};

export default ContactForm;
