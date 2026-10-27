import { useMutation } from '@tanstack/react-query';
import { UndoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type FieldValues, type Path, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation; single-use validator hook scoped to this form field.
import { type CheckSlugData, type CheckSlugResponse, checkSlug } from 'sdk';
import type { ChannelEntityType } from 'shared';
import slugify from 'slugify';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { ApiError } from '~/lib/api';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { Button } from '~/modules/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

// The form a slug is stored in. The input lowers what is typed, as the API does with an upper-case slug.
const slugPattern = /^[a-z0-9]+(-{1,3}[a-z0-9]+)*$/;

type SlugFormFieldProps<TFieldValues extends FieldValues> = Omit<BaseFormFieldProps<TFieldValues>, 'name'> & {
  entityType: ChannelEntityType | 'user';
  tenantId?: string;
  nameValue?: string;
  description?: string;
  previousSlug?: string;
  prefix?: string;
};

/** An entity's slug: derived from `nameValue` until edited, checked for availability, required unless `required` is false. */
export function SlugFormField<TFieldValues extends FieldValues>({
  control,
  label,
  required = true,
  disabled,
  previousSlug,
  description,
  nameValue,
  entityType,
  tenantId,
  prefix,
}: SlugFormFieldProps<TFieldValues>) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const name = 'slug';

  const [isDeviating, setIsDeviating] = useState(false);
  // Appended to a derived slug that is too short or taken, so the user never has to fix a field they did not type in
  const [suffix] = useState(() => Math.random().toString(36).slice(2, 6));
  const isDerived = !previousSlug && !isDeviating;
  const [availability, setAvailability] = useState<'available' | 'blank' | 'notAvailable'>('blank');
  // Availability responses for a value the user has since replaced are ignored.
  const latestSlugRef = useRef('');

  // Repeated on the group's focus state, whose own ring color would hide the answer while the user types
  const availabilityRingClass = cn(
    availability === 'available' && 'ring-2 ring-success focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-success',
    availability === 'notAvailable' && 'ring-2 ring-destructive focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-destructive',
  );

  const form = useFormContext<{ slug: string }>();

  const slug = useWatch({ control: form.control, name: name });

  const { mutate: checkAvailability } = useMutation<CheckSlugResponse, ApiError, NonNullable<CheckSlugData['body']>>({
    mutationKey: [name],
    // A taken slug shows on the field; the check runs while the user types, so it never toasts.
    meta: { suppressGlobalErrorToast: true },
    mutationFn: async (body) => {
      if (!tenantId) return;
      return await checkSlug({ path: { tenantId }, body });
    },
    onSuccess: (_, variables) => {
      if (variables.slug !== latestSlugRef.current) return;
      // Only the manual availability error is ours to clear; resolver errors on the value stay.
      if (form.getFieldState(name).error?.type === 'manual') form.clearErrors(name);
      setAvailability('available');
    },
    onError: (error, variables) => {
      if (variables.slug !== latestSlugRef.current) return;
      if (error.status !== 409) return setAvailability('blank');
      if (isDerived && !variables.slug.endsWith(`-${suffix}`)) return form.setValue(name, `${variables.slug}-${suffix}`);
      form.setError(name, { type: 'manual', message: t('error:slug_exists') });
      setAvailability('notAvailable');
    },
  });

  useEffect(() => {
    const value = slug ?? '';
    latestSlugRef.current = value;

    if (value.length < 2 || value === previousSlug) return setAvailability('blank');
    if (!slugPattern.test(value)) return setAvailability('notAvailable');

    // Valid: neutral until a check answers; user slugs are globally unique and checked by the update API.
    setAvailability('blank');
    if (!isOnline || entityType === 'user' || !tenantId) return;
    checkAvailability({ slug: value, entityType });
  }, [slug]);

  // Create forms derive the slug from the name until the user edits it
  useEffect(() => {
    if (!isDerived) return;
    const derived = slugify(nameValue || '', { lower: true, strict: true });
    // A name of one letter, or of letters slugify cannot spell (Chinese, Arabic), still gets a valid slug
    const fallback = `${derived || slugify(entityType, { lower: true })}-${suffix}`;
    form.setValue(name, derived.length >= 2 || !nameValue?.trim() ? derived : fallback);
  }, [nameValue]);

  return (
    <FormField
      control={control}
      name={name as Path<TFieldValues>}
      render={({ field: { value: formFieldValue, onChange, ...rest } }) => (
        <FormItem name={name} disabled={disabled}>
          <FormLabel help={description} required={required}>
            {label}
          </FormLabel>
          <InputGroup className={availabilityRingClass}>
            <FormControl>
              <InputGroupInput
                onFocus={() => setIsDeviating(true)}
                value={formFieldValue || ''}
                onChange={(event) => onChange(event.target.value.toLowerCase())}
                {...rest}
              />
            </FormControl>
            {prefix && (
              <InputGroupAddon>
                <InputGroupText className={cn('text-xs', !formFieldValue && 'opacity-50')}>{prefix}</InputGroupText>
              </InputGroupAddon>
            )}

            {previousSlug && previousSlug !== slug && (
              <InputGroupAddon align="inline-end">
                <Button variant="ghost" size="sm" aria-label={t('c:revert_handle')} onClick={() => form.resetField(name)} className="h-full">
                  <UndoIcon />
                  <span className="max-sm:hidden">{t('c:revert')}</span>
                </Button>
              </InputGroupAddon>
            )}
          </InputGroup>
          <FormMessage messages={{ invalid_format: t('error:invalid_handle') }} />
        </FormItem>
      )}
    />
  );
}
