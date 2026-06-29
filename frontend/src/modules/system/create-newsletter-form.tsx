import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { InfoIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation — single-use admin newsletter send.
import { type SendNewsletterData, type SendNewsletterResponse, sendNewsletter } from 'sdk';
import { zSendNewsletterBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import type { ApiError } from '~/lib/api';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { blocksToHTML } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import BlockNoteContentFormField from '~/modules/common/form-fields/blocknote';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectRoles } from '~/modules/common/form-fields/select-roles';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import type { MutationData } from '~/query/types';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';

const formSchema = zSendNewsletterBody;

type FormValues = z.infer<typeof formSchema>;
interface CreateNewsletterFormProps {
  organizationIds: string[];
  callback?: (args: CallbackArgs) => void;
}

export function CreateNewsletterForm({ organizationIds, callback }: CreateNewsletterFormProps) {
  const { t } = useTranslation();
  const subjectLabel = t('c:subject').toLowerCase();

  const [testOnly, setTestOnly] = useState<boolean>(false);

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: { organizationIds, subject: '', roles: [], content: '' },
  };

  // Create form
  const formContainerId = 'create-newsletter';
  const form = useFormWithDraft<FormValues>(formContainerId, { formOptions });

  // SendIcon newsletter
  const { mutate: _sendNewsletter, isPending } = useMutation<
    SendNewsletterResponse,
    ApiError,
    MutationData<SendNewsletterData>
  >({
    mutationFn: async ({ body, query }) => {
      return await sendNewsletter({ body, query });
    },
    onSuccess: () => {
      if (testOnly) return toaster(t('c:success.test_email'), 'success');
      form.reset();
      toaster(t('c:success.create_newsletter'), 'success');
      useSheeter.getState().remove(formContainerId);
      callback?.({ status: 'success' });
    },
  });

  const onSubmit = async (data: FormValues) => {
    // Set organizationIds here to avoind having them in draft & converting string blocks to HTML
    const body = {
      ...data,
      organizationIds,
      content: blocksToHTML(data.content),
    };
    _sendNewsletter({ body, query: { toSelf: !!testOnly } });
  };

  const cancel = () => form.reset();

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
      <form onSubmit={form.handleSubmit(onSubmit)} id="newsletter-form" className="h-max space-y-6 pb-8">
        <InputFormField
          control={form.control}
          inputClassName="font-bold"
          name="subject"
          placeholder={t('c:placeholder.type_input', { inputLabel: subjectLabel })}
          label={t('c:subject')}
          required
        />

        <BlockNoteContentFormField
          control={form.control}
          name="content"
          label={t('c:message')}
          required
          autoFocus
          baseBlockNoteProps={{
            id: `${appConfig.name}-blocknote-newsletter`,
            trailingBlock: false,
            className:
              'min-h-20 pl-10 pr-6 p-3 border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring max-focus-visible:ring-transparent max-focus-visible:ring-offset-0 flex w-full rounded-md border text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-effect disabled:cursor-not-allowed disabled:opacity-50',
            baseFilePanelProps: { isPublic: true, organizationId: 'adminPreview' },
            excludeFileBlockTypes: ['video', 'audio', 'file'],
          }}
        />

        <FormField
          control={form.control}
          name="roles"
          render={({ field: { value, onChange } }) => (
            <FormItem>
              <FormLabel>
                {t('c:roles')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <SelectRoles value={value} onValueChange={onChange} />
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
          <SubmitButton disabled={!canSend()} loading={isPending} icon={<SendIcon size={16} />}>
            {testOnly ? t('c:send_test_email') : t('c:send')}
          </SubmitButton>
          <Button
            type="reset"
            variant="secondary"
            className={isDirty() ? '' : 'invisible'}
            aria-label={t('c:cancel')}
            onClick={cancel}
          >
            {t('c:cancel')}
          </Button>
          <div className="flex items-center gap-2 max-sm:mt-2">
            <Checkbox
              id="testOnly"
              checked={testOnly}
              onCheckedChange={(value) => setTestOnly(value)}
              className="ml-4 size-4"
            />
            <label htmlFor="testOnly" className="items-center text-sm">
              {t('c:test_email')}
            </label>
          </div>
        </div>
      </form>
    </Form>
  );
}
