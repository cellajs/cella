import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { CreateServiceAccountData, CreateServiceAccountResponse } from 'sdk';
import { zCreateServiceAccountBody } from 'sdk/zod.gen';
import { hierarchy } from 'shared';
import type { z } from 'zod';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useCreateServiceAccountMutation } from '~/modules/service-accounts/query';
import { Form } from '~/modules/ui/field';
import type { QueryOrgContext } from '~/query/types';
import { formResolver } from '~/utils/form-resolver';

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

/** Creating a key makes a service account named after it, bound to this organization with its least privileged role. */
export function CreateApiKeyForm({ path, onCreated }: CreateApiKeyFormProps) {
  const { t } = useTranslation();
  const { mutateAsync: create, isPending } = useCreateServiceAccountMutation();

  const form = useForm<FormValues>({ resolver: formResolver(formSchema), defaultValues: { name: '' } });
  const { isDirty } = useFormState({ control: form.control });

  const closeDialog = () => dialoger.getState().remove(createApiKeyDialogId);

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
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <InputFormField
          control={form.control}
          name="name"
          label={t('c:name')}
          placeholder={t('c:placeholder.type_input', { inputLabel: t('c:name') })}
          required
        />

        <FormActions>
          <SubmitButton loading={isPending}>{t('c:create')}</SubmitButton>
          <CancelButton dirty={isDirty} onClick={() => form.reset()} />
        </FormActions>
      </form>
    </Form>
  );
}
