import { useMutation } from '@tanstack/react-query';
import { InfoIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for a single-use admin newsletter send.
import { type SendNewsletterData, type SendNewsletterResponse, sendNewsletter } from 'sdk';
import { zSendNewsletterBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import { systemUploadPrefix } from 'shared/utils/upload-visibility';
import type { z } from 'zod';
import type { ApiError } from '~/lib/api';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { blocknoteFieldIsDirty } from '~/modules/common/blocknote/helpers/blocknote-field-is-dirty';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { InputFormField } from '~/modules/common/form-fields/input';
import { LazyBlockNoteContentFormField } from '~/modules/common/form-fields/lazy-blocknote';
import { SelectRoles } from '~/modules/common/form-fields/select-roles';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import type { MutationData } from '~/query/types';
import { formResolver } from '~/utils/form-resolver';

/** The id of the form's draft and of the sheet it renders in, which shows the unsaved badge. */
export const newsletterFormId = 'create-newsletter';

// A newsletter goes out to every member it picks, so it never leaves without a subject
const formSchema = zSendNewsletterBody.extend({ subject: zSendNewsletterBody.shape.subject.trim().min(1) });

type FormValues = z.infer<typeof formSchema>;
interface CreateNewsletterFormProps {
  organizationIds: string[];
}

export function CreateNewsletterForm({ organizationIds }: CreateNewsletterFormProps) {
  const { t } = useTranslation();
  const subjectLabel = t('c:subject').toLowerCase();

  const [testOnly, setTestOnly] = useState<boolean>(false);

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { organizationIds, subject: '', roles: [], content: '' },
  };

  const form = useFormWithDraft<FormValues>(newsletterFormId, { formOptions });

  // SendIcon newsletter
  const { mutate: _sendNewsletter, isPending } = useMutation<SendNewsletterResponse, ApiError, MutationData<SendNewsletterData>>({
    mutationFn: async ({ body, query }) => {
      return await sendNewsletter({ body, query });
    },
    onSuccess: () => {
      if (testOnly) return toaster.success(t('c:success.test_email'));
      form.reset();
      toaster.success(t('c:success.create_newsletter'));
      sheeter.getState().remove(newsletterFormId);
    },
  });

  const onSubmit = async (data: FormValues) => {
    // Imported on submit: blocksToHTML builds a headless BlockNoteEditor, and importing it here keeps
    // @blocknote/core off the boot path for everyone who never opens this form.
    const { blocksToHTML } = await import('~/modules/common/blocknote/helpers/blocknote-helpers');
    // Set organizationIds here to avoind having them in draft & converting string blocks to HTML
    const body = { ...data, organizationIds, content: blocksToHTML(data.content) };
    _sendNewsletter({ body, query: { toSelf: !!testOnly } });
  };

  const canSend = () => {
    if (!form.isDirty) return false;
    const { content, roles } = form.getValues();
    return blocknoteFieldIsDirty(content) && roles.length > 0;
  };

  const isDirty = () => {
    if (!form.isDirty) return false;
    const { content, roles, subject } = form.getValues();
    return roles.length > 0 || subject.length > 0 || blocknoteFieldIsDirty(content);
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} id="newsletter-form" className="flex h-max flex-col gap-6 pb-8">
        <InputFormField
          control={form.control}
          inputClassName="font-bold"
          name="subject"
          placeholder={t('c:placeholder.type_input', { inputLabel: subjectLabel })}
          label={t('c:subject')}
          required
        />

        <LazyBlockNoteContentFormField
          control={form.control}
          name="content"
          label={t('c:message')}
          required
          autoFocus
          baseBlockNoteProps={{
            id: `${appConfig.name}-blocknote-newsletter`,
            trailingBlock: false,
            className:
              'min-h-20 pl-10 pr-6 p-3 border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-effect disabled:cursor-not-allowed disabled:opacity-50',
            // Newsletter images go to the public bucket under the system prefix, where email clients load them.
            baseFilePanelProps: { mediaMode: 'public-no-attachment', templateId: 'newsletter', organizationId: systemUploadPrefix },
            excludeFileBlockTypes: ['video', 'audio', 'file'],
          }}
        />

        <FormField
          control={form.control}
          name="roles"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <SelectRoles value={value} onChange={onChange} label={t('c:roles')} required />
              <FormMessage />
            </FormItem>
          )}
        />

        {testOnly && (
          <AlertBanner id="test-email" variant="plain" icon={InfoIcon} animate>
            {t('c:test_email.text')}
          </AlertBanner>
        )}

        <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
          <SubmitButton disabled={!canSend()} loading={isPending} icon={<SendIcon />}>
            {testOnly ? t('c:send_test_email') : t('c:send')}
          </SubmitButton>
          <CancelButton dirty={isDirty()} onClick={() => form.reset()} />
          <div className="flex items-center gap-2 max-sm:mt-2">
            <Checkbox id="testOnly" checked={testOnly} onCheckedChange={(value) => setTestOnly(value)} className="ml-4 size-4" />
            <label htmlFor="testOnly" className="items-center text-sm">
              {t('c:test_email')}
            </label>
          </div>
        </div>
      </form>
    </Form>
  );
}
