import { useMutation } from '@tanstack/react-query';
import type { Control } from 'react-hook-form';
import { useFormContext, useWatch } from 'react-hook-form';
import { checkSlugAvailable } from '~/api/general';
import InputFormField from './input';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { Undo } from 'lucide-react';
import slugify from 'slugify';

interface SlugFieldProps {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  label: string;
  nameValue?: string;
  description?: string;
  previousSlug?: string;
}

export const SlugFormField = ({ control, label, previousSlug, description, nameValue }: SlugFieldProps) => {
  const form = useFormContext();
  const { t } = useTranslation();
  const [isDeviating, setDeviating] = useState(false);
  const [isSlugAvailable, setSlugAvailable] = useState(false);

  useMutation({
    mutationFn: checkSlugAvailable,
    onSuccess: (isAvailable) => {
      if (isAvailable) return form.clearErrors('slug');

      form.setError('slug', {
        type: 'manual',
        message: t('common:error.slug_exists'),
      });
    },
  });

  // Watch to check if slug availability
  const slug = useWatch({ control: form.control, name: 'slug' });

  const isValidSlug = (value: string) => {
    const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return regex.test(value) && !value.startsWith('-') && !value.endsWith('-') && value.replaceAll(' ', '') !== '';
  };

  useEffect(() => {
    if (previousSlug && slug === previousSlug) return;
    if (isValidSlug(slug)) checkSlugAvailable(slug).then((response) => setSlugAvailable(response));
    setSlugAvailable(false);
  }, [slug]);

  // In create forms, auto-generate from name
  useEffect(() => {
    if (previousSlug || isDeviating) return;

    form.setValue('slug', slugify(nameValue || '', { lower: true }));
  }, [nameValue]);

  // Revert to previous slug
  const revertSlug = () => {
    form.resetField('slug');
  };

  return (
    <InputFormField
      control={control}
      name="slug"
      inputClassName={isSlugAvailable ? 'ring-2 ring-green-500 focus-visible:ring-2 focus-visible:ring-green-500' : ''}
      onFocus={() => setDeviating(true)}
      label={label}
      description={description}
      required
      subComponent={
        previousSlug &&
        previousSlug !== slug && (
          <div className="absolute inset-y-1 right-1 flex justify-end">
            <Button variant="ghost" size="sm" aria-label={t('common:revert_handle')} onClick={revertSlug} className="h-full">
              <Undo size={16} className="mr-2" /> {t('common:revert_to')} <strong className="ml-1">{previousSlug}</strong>
            </Button>
          </div>
        )
      }
    />
  );
};
