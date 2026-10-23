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
import { blocknoteHasContent } from '~/modules/common/blocknote/helpers/blocknote-has-content';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { InputFormField } from '~/modules/common/form-fields/input';
import { blockNoteFieldClass, LazyBlockNoteContentFormField } from '~/modules/common/form-fields/lazy-blocknote';
import { SelectRoles } from '~/modules/common/form-fields/select-roles';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { Label } from '~/modules/ui/label';
import type { MutationData } from '~/query/types';
import { cn } from '~/utils/cn';
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

  const [testOnly, setTestOnly] = useState(false);

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { organizationIds, subject: '', roles: [], content: '' },
  };

  const form = useFormWithDraft<FormValues>(newsletterFormId, { formOptions });

  const { mutate: send, isPending } = useMutation<SendNewsletterResponse, ApiError, MutationData<SendNewsletterData>>({
    mutationFn: (variables) => sendNewsletter(variables),
    onSuccess: () => {
      if (testOnly) return toaster.success(t('c:success.test_email'));
      form.reset();
      toaster.success(t('c:success.create_newsletter'));
      sheeter.getState().remove(newsletterFormId);
    },
  });

  const onSubmit = async (values: FormValues) => {
    // Imported on submit, so @blocknote/core stays off the boot path.
    const { blocksToHTML } = await import('~/modules/common/blocknote/helpers/blocknote-helpers');
    // The selected organizations, not a restored draft's, and the blocks as HTML.
    const body = { ...values, organizationIds, content: blocksToHTML(values.content) };
    send({ body, query: { toSelf: testOnly } });
  };

  const canSend = () => {
    if (!form.isDirty) return false;
    const { content, roles } = form.getValues();
    return blocknoteHasContent(content) && roles.length > 0;
  };

  const hasInput = () => {
    if (!form.isDirty) return false;
    const { content, roles, subject } = form.getValues();
    return roles.length > 0 || subject.length > 0 || blocknoteHasContent(content);
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6 pb-8">
        <InputFormField
          control={form.control}
          inputClassName="font-bold"
          name="subject"
          placeholder={t('c:placeholder.type_input', { inputLabel: t('c:subject').toLowerCase() })}
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
            className: cn(blockNoteFieldClass, 'pl-10'),
            // Newsletter images go to the public bucket under the system prefix, where email clients load them.
            baseFilePanelProps: { mediaMode: 'public-no-attachment', templateId: 'newsletter', organizationId: systemUploadPrefix },
            excludeMediaBlockTypes: ['video', 'audio', 'file'],
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
          <CancelButton dirty={hasInput()} onClick={() => form.reset()} />
          <div className="flex items-center gap-2 max-sm:mt-2">
            <Checkbox id="testOnly" checked={testOnly} onCheckedChange={setTestOnly} className="ml-4 size-4" />
            <Label htmlFor="testOnly">{t('c:test_email')}</Label>
          </div>
        </div>
      </form>
    </Form>
  );
}
