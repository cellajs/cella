import { Field } from '@base-ui/react/field';
import { useMutation } from '@tanstack/react-query';
import { UndoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FieldValues, type Path, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation; single-use validator hook scoped to this form field.
import { type CheckSlugData, type CheckSlugResponse, checkSlug } from 'sdk';
import type { ChannelEntityType } from 'shared';
import slugify from 'slugify';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { ApiError } from '~/lib/api';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { Button } from '~/modules/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

type SlugFieldProps<TFieldValues extends FieldValues> = Omit<BaseFormFieldProps<TFieldValues>, 'name'> & {
  entityType: ChannelEntityType | 'user';
  tenantId?: string;
  nameValue?: string;
  description?: string;
  previousSlug?: string;
  prefix?: string;
};

/** Field.Control wrapper, for automatic label and aria association. */
function SlugInput(props: React.ComponentProps<typeof InputGroupInput>) {
  return <Field.Control render={<InputGroupInput {...props} />} />;
}

export function SlugFormField<TFieldValues extends FieldValues>({
  control,
  label,
  previousSlug,
  description,
  nameValue,
  entityType,
  tenantId,
  prefix: customPrefix,
}: SlugFieldProps<TFieldValues>) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const name = 'slug';

  const [isDeviating, setDeviating] = useState(false);
  const [isSlugAvailable, setSlugAvailable] = useState<'available' | 'blank' | 'notAvailable'>('blank');

  const prefix = customPrefix;

  const inputClassName = `${isSlugAvailable !== 'blank' && 'ring-2 sm:focus-visible:ring-2'}
                          ${isSlugAvailable === 'available' && 'ring-green-500 focus-visible:ring-green-500'}
                          ${isSlugAvailable === 'notAvailable' && 'ring-red-500 focus-visible:ring-red-500'}`;

  const form = useFormContext<{ slug: string }>();

  const slug = useWatch({ control: form.control, name: name });

  const { mutate: checkAvailability } = useMutation<CheckSlugResponse, ApiError, NonNullable<CheckSlugData['body']>>({
    mutationKey: [name],
    mutationFn: async (body) => {
      if (!tenantId) return;
      return await checkSlug({ path: { tenantId }, body });
    },
    onSuccess: () => {
      if (!isValidSlug(slug)) return;
      form.clearErrors(name);
      setSlugAvailable('available');
    },
    onError: () => {
      form.setError(name, { type: 'manual', message: t('error:slug_exists') });
      setSlugAvailable('notAvailable');
    },
  });

  const isValidSlug = (value: string) => {
    if (!value || value.trim().length < 2) return false;
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
  };

  useEffect(() => {
    if (slug.length < 2 || (isValidSlug(slug) && previousSlug && previousSlug === slug))
      return setSlugAvailable('blank');
    if (isValidSlug(slug)) {
      if (!isOnline) return;
      // Skip availability check for user slugs (globally unique, handled by update API)
      if (entityType === 'user' || !tenantId) return;

      return checkAvailability({ slug, entityType });
    }
    if (!isValidSlug(slug)) return setSlugAvailable('notAvailable');
  }, [slug]);

  // Create forms derive the slug from the name until the user edits it
  useEffect(() => {
    if (previousSlug || isDeviating) return;
    form.setValue(name, slugify(nameValue || '', { lower: true, strict: true }));
  }, [nameValue]);

  const revertSlug = () => {
    form.resetField(name);
  };

  return (
    <FormField
      control={control}
      name={name as Path<TFieldValues>}
      render={({ field: { value: formFieldValue, ...rest } }) => (
        <FormItem name={name}>
          <FormLabel help={description}>
            {label}
            <span className="ml-1 opacity-50">*</span>
          </FormLabel>
          <InputGroup className={cn('', inputClassName)}>
            <SlugInput type={entityType} onFocus={() => setDeviating(true)} value={formFieldValue || ''} {...rest} />
            {prefix && (
              <InputGroupAddon>
                <InputGroupText id="slug-prefix" className="text-xs" style={{ opacity: formFieldValue ? 1 : 0.5 }}>
                  {prefix}
                </InputGroupText>
              </InputGroupAddon>
            )}

            {previousSlug && previousSlug !== slug && (
              <InputGroupAddon align="inline-end">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('c:revert_handle')}
                  onClick={revertSlug}
                  className="h-full"
                >
                  <UndoIcon /> <span className="ml-1 max-sm:hidden">{t('c:revert')}</span>
                </Button>
              </InputGroupAddon>
            )}
          </InputGroup>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
