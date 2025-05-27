import { sendNewsletterBodySchema } from '#/modules/system/schema';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { useMutation } from '@tanstack/react-query';
import { Info, Send } from 'lucide-react';
import { Suspense, lazy, useMemo, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { blocksToHTML } from '~/modules/common/blocknote/helpers';
import InputFormField from '~/modules/common/form-fields/input';
import SelectRoles from '~/modules/common/form-fields/select-roles';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster';
import { sendNewsletter } from '~/modules/system/api';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';

const BlockNoteContent = lazy(() => import('~/modules/common/form-fields/blocknote-content'));
interface CreateNewsletterFormProps {
  organizationIds: string[];
  callback?: () => void;
}

const formSchema = sendNewsletterBodySchema;

type FormValues = z.infer<typeof formSchema>;

const CreateNewsletterForm = ({ organizationIds, callback }: CreateNewsletterFormProps) => {
  const { t } = useTranslation();

  const [testOnly, setTestOnly] = useState<CheckedState>(false);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: { organizationIds, subject: '', roles: [], content: '' },
    }),
    [],
  );

  // Create form
  const formContainerId = 'create-newsletter';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  // Send newsletter
  const { mutate: _sendNewsletter, isPending } = useMutation({
    mutationFn: sendNewsletter,
    onSuccess: () => {
      if (testOnly) return toaster(t('common:success.test_email'), 'success');
      form.reset();
      toaster(t('common:success.create_newsletter'), 'success');
      useSheeter.getState().remove(formContainerId);
      callback?.();
    },
  });

  const onSubmit = async (data: FormValues) => {
    // Set organizationIds here to avoind having them in draft & converting string blocks to HTML
    const body = {
      ...data,
      organizationIds,
      content: await blocksToHTML(data.content),
    };
    _sendNewsletter({ body, toSelf: !!testOnly });
  };

  const cancel = () => form.reset();

  const canSend = () => {
    if (!form.formState.isDirty) return false;
    const { content, roles } = form.getValues();
    return blocknoteFieldIsDirty(content) && roles.length > 0;
  };

  const isDirty = () => {
    if (!form.formState.isDirty) return false;
    const { content, roles, subject } = form.getValues();
    return roles.length > 0 || subject.length > 0 || blocknoteFieldIsDirty(content);
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} id="newsletter-form" className="space-y-6 pb-8 h-max">
        <InputFormField
          control={form.control}
          inputClassName="font-bold"
          name="subject"
          placeholder={t('common:placeholder.subject')}
          label={t('common:subject')}
          required
        />

        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContent
            control={form.control}
            name="content"
            required
            label={t('common:message')}
            BaseBlockNoteProps={{
              id: 'blocknote-newsletter',
              trailingBlock: false,
              className:
                'min-h-20 pl-10 pr-6 p-3 border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 flex w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              baseFilePanelProps: { organizationId: 'adminPreview' },
            }}
          />
        </Suspense>

        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('common:roles')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormControl>
                <SelectRoles {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {testOnly && (
          <AlertWrap id="test-email" variant="plain" icon={Info}>
            {t('common:test_email.text')}
          </AlertWrap>
        )}

        <div className="flex max-sm:flex-col max-sm:items-stretch gap-2 items-center">
          <SubmitButton disabled={!canSend()} loading={isPending}>
            <Send size={16} className="mr-2" />
            {testOnly ? t('common:send_test_email') : t('common:send')}
          </SubmitButton>
          <Button type="reset" variant="secondary" className={isDirty() ? '' : 'invisible'} aria-label={t('common:cancel')} onClick={cancel}>
            {t('common:cancel')}
          </Button>
          <div className="max-sm:mt-2 flex gap-2 items-center">
            <Checkbox id="testOnly" checked={testOnly} onCheckedChange={(value) => setTestOnly(value)} className="w-4 h-4 ml-4" />
            <label htmlFor="testOnly" className="items-center text-sm">
              {t('common:test_email')}
            </label>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default CreateNewsletterForm;
