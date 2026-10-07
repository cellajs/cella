import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { CreateServiceAccountData, CreateServiceAccountResponse } from 'sdk';
import { zCreateServiceAccountBody } from 'sdk/zod.gen';
import { hierarchy } from 'shared';
import type { z } from 'zod';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useCreateServiceAccountMutation } from '~/modules/service-accounts/query';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/field';
import type { QueryOrgContext } from '~/query/types';

export const createApiKeyDialogId = 'create-api-key';

// Narrowed to the organization roles the create body accepts: the hierarchy can type a role registry-wide.
const keyRole = hierarchy.getLeastPrivilegedRole('organization') as CreateServiceAccountData['body']['role'];

const formSchema = zCreateServiceAccountBody.pick({ name: true });

type FormValues = z.infer<typeof formSchema>;

/** A key as the create response carries it: the one time it comes with its plaintext. */
export type CreatedApiKey = NonNullable<CreateServiceAccountResponse['apiKey']>;

interface CreateApiKeyFormProps {
  path: QueryOrgContext;
  onCreated: (apiKey: CreatedApiKey) => void;
}

/**
 * The one-step key experience (substrate D21): creating a key makes an implicit service account named after the key,
 * bound to this organization with its least privileged role. The dialog closes on success and hands the key over.
 */
export function CreateApiKeyForm({ path, onCreated }: CreateApiKeyFormProps) {
  const { t } = useTranslation();
  const { mutateAsync: create, isPending } = useCreateServiceAccountMutation();

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: '' } });
  const { isDirty } = useFormState({ control: form.control });

  const closeDialog = () => useDialoger.getState().remove(createApiKeyDialogId);

  const onSubmit = (values: FormValues) => {
    const name = values.name.trim();
    // Awaited on the promise, which settles even when the dialog closed mid-request: the plaintext always reaches the card.
    create({ path, body: { name, role: keyRole, key: { name } } }).then(
      ({ apiKey }) => {
        if (apiKey) onCreated(apiKey);
        closeDialog();
      },
      // The mutation reports its own failures; the form stays open for another try.
      () => {},
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <InputFormField
          control={form.control}
          name="name"
          label={t('c:name')}
          placeholder={t('c:placeholder.type_input', { inputLabel: t('c:name').toLowerCase() })}
          required
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton loading={isPending}>{t('c:create')}</SubmitButton>
          <Button type="reset" variant="secondary" onClick={() => form.reset()} className={isDirty ? '' : 'invisible'}>
            {t('c:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
