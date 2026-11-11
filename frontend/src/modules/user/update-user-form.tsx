import { useTranslation } from 'react-i18next';
import type { User } from 'sdk';
import { zUpdateUserBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { AvatarFormField } from '~/modules/common/form-fields/avatar';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { useUpdateUser } from '~/modules/user/query';
import { useCurrentUser } from '~/modules/user/user-store';
import { formResolver } from '~/utils/form-resolver';

const formSchema = zUpdateUserBody;

type FormValues = z.infer<typeof formSchema>;

/** Accepts both User (self-update) and BaseUser (admin table). Only `id` is required; other fields pre-fill the form. */
type FormUser = Pick<User, 'id'> & Partial<FormValues>;

const toFormValues = (user: FormUser): FormValues => ({
  thumbnailUrl: user.thumbnailUrl,
  givenName: user.givenName,
  familyName: user.familyName,
  slug: user.slug,
  languageCode: user.languageCode,
  newsletter: user.newsletter,
});

interface UpdateUserFormProps {
  user: FormUser;
  sheet?: boolean;
}

export function UpdateUserForm({ user, sheet: isSheet }: UpdateUserFormProps) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const isSelf = currentUser.id === user.id;

  const { mutate: updateUser, isPending } = useUpdateUser(user.id);

  const formOptions = { resolver: formResolver(formSchema), defaultValues: toFormValues(user) };

  const formContainerId = 'update-user';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${user.id}`, { formOptions, formContainerId });

  useBeforeUnload(form.isDirty);

  const onSubmit = (changes: Partial<FormValues>) => {
    updateUser(changes, {
      onSuccess: (updatedUser) => {
        const message = isSelf ? t('c:success.profile_updated') : t('c:success.update_resource', { resource: t('c:user') });
        toaster.success(message);

        form.reset(toFormValues(updatedUser));
        if (isSheet) sheeter.getState().remove(formContainerId);
      },
    });
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleChanges(onSubmit)} className="flex w-full flex-col gap-6">
        <AvatarFormField form={form} label={t('c:profile_picture')} type="user" name="thumbnailUrl" entity={user} />
        {isSelf && (
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
            <InputFormField control={form.control} name="givenName" label={t('c:given_name')} autoComplete="given-name" />
            <InputFormField control={form.control} name="familyName" label={t('c:family_name')} autoComplete="family-name" />
          </div>
        )}

        <SlugFormField
          control={form.control}
          entityType="user"
          label={t('c:resource_handle', { resource: t('c:user') })}
          description={t('c:user_handle.text')}
          previousSlug={user.slug}
        />

        {isSelf && (
          <>
            {currentUser.email && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-email">{t('c:email')}</Label>
                <Input id="account-email" value={currentUser.email} autoComplete="off" disabled />
              </div>
            )}

            <FormField
              control={form.control}
              name="languageCode"
              render={({ field }) => (
                <FormItem name="languageCode">
                  <FormLabel required>{t('c:language_code')}</FormLabel>
                  <SelectLanguage
                    options={[...appConfig.languageCodes]}
                    value={field.value ?? appConfig.defaultLanguageCode}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newsletter"
              render={({ field }) => (
                <FormItem className="flex-row items-center" name="newsletter">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  <FormLabel>{t('c:newsletter')}</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormActions>
          <SubmitButton disabled={!form.isDirty || Object.keys(form.formState.errors).length > 0} loading={isPending}>
            {t('c:save_changes')}
          </SubmitButton>
          <CancelButton dirty={form.isDirty} onClick={() => form.reset()} />
        </FormActions>
      </form>
    </Form>
  );
}
