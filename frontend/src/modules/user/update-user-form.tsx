import { zodResolver } from '@hookform/resolvers/zod';
import type { UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { User } from 'sdk';
import { zUpdateUserBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useBeforeUnload } from '~/hooks/use-before-unload';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { AvatarFormField } from '~/modules/common/form-fields/avatar';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';
import { SlugFormField } from '~/modules/common/form-fields/slug';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useStepper } from '~/modules/common/stepper/stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { useUserUpdateMutation } from '~/modules/user/query';
import { useUserStore } from '~/modules/user/user-store';

const formSchema = zUpdateUserBody;

type FormValues = z.infer<typeof formSchema>;

/** Accepts both User (self-update) and BaseUser (admin table). Only `id` is required; other fields pre-fill the form. */
type FormUser = Pick<User, 'id'> & Partial<FormValues>;

interface UpdateUserFormProps {
  user: FormUser;
  sheet?: boolean;
  /** Show only essential fields (avatar, name) for onboarding */
  compact?: boolean;
  children?: React.ReactNode;
  callback?: (args: CallbackArgs<User>) => void;
}

export function UpdateUserForm({ user, callback, sheet: isSheet, compact, children }: UpdateUserFormProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === user.id;
  const { nextStep } = useStepper();

  const updateSelf = useUpdateSelfMutation();
  const updateUser = useUserUpdateMutation();
  const isPending = updateSelf.isPending || updateUser.isPending;

  const formOptions: UseFormProps<FormValues> = {
    resolver: zodResolver(formSchema),
    defaultValues: user,
  };

  const formContainerId = 'update-user';
  const form = useFormWithDraft<FormValues>(`${formContainerId}-${user.id}`, { formOptions, formContainerId });

  // Prevent data loss
  useBeforeUnload(form.isDirty);

  const onSubmit = (values: FormValues) => {
    if (!user) return;

    const onSuccess = (updatedUser: User) => {
      const message = isSelf ? t('c:success.profile_updated') : t('c:success.update_item', { item: t('c:user') });
      toaster(message, 'success');

      form.reset(updatedUser);
      if (isSheet) useSheeter.getState().remove(formContainerId);

      // Onboarding advances through stepper state; the callback is optional.
      nextStep?.();

      callback?.({ data: updatedUser, status: 'success' });
    };

    if (isSelf) {
      updateSelf.mutate(values, { onSuccess });
    } else {
      updateUser.mutate({ path: { id: user.id }, body: values }, { onSuccess });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <AvatarFormField
          form={form}
          label={children ? '' : t('c:profile_picture')}
          type="user"
          name="thumbnailUrl"
          entity={user}
        />
        {/* Personal fields only shown for self. Admins edit avatar/slug only. */}
        {isSelf && (
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
            <InputFormField
              inputClassName="border"
              control={form.control}
              name="firstName"
              label={t('c:first_name')}
              required
            />
            <InputFormField
              inputClassName="border"
              control={form.control}
              name="lastName"
              label={t('c:last_name')}
              required
            />
          </div>
        )}

        {!compact && (
          <>
            <SlugFormField
              control={form.control}
              entityType="user"
              label={t('c:resource_handle', { resource: t('c:user') })}
              description={t('c:user_handle.text')}
              previousSlug={user.slug}
            />

            {isSelf && (
              <>
                <div className="flex flex-col gap-2">
                  <Label>{t('c:email')}</Label>
                  <Input value={currentUser.email} autoComplete="off" disabled />
                </div>

                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem name="language">
                      <FormLabel>
                        {t('c:language')}
                        <span className="ml-1 opacity-50">*</span>
                      </FormLabel>
                      <SelectLanguage
                        options={[...appConfig.languages]}
                        value={field.value ?? appConfig.defaultLanguage}
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
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel>{t('c:newsletter')}</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton
            disabled={!compact && (!form.isDirty || Object.keys(form.formState.errors).length > 0)}
            loading={isPending}
          >
            {t(`c:${compact ? 'continue' : 'save_changes'}`)}
          </SubmitButton>
          {!children && (
            <Button
              type="reset"
              variant="secondary"
              onClick={() => form.reset()}
              className={form.isDirty ? '' : 'invisible'}
            >
              {t('c:cancel')}
            </Button>
          )}
          {children}
        </div>
      </form>
    </Form>
  );
}
