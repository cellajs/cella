import { useMutation } from '@tanstack/react-query';
import type { Control } from 'react-hook-form';
import { useFormContext, useWatch } from 'react-hook-form';
import { checkSlugAvailable } from '~/api/general';
import InputFormField from './input';
import { useEffect } from 'react';

interface SlugFieldProps {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  required?: boolean;
  onFocus?: () => void;
  description?: string;
  errorMessage?: string;
  subComponent?: React.ReactNode;
  previousSlug?: string;
}

export const SlugField = ({
  control,
  name,
  onFocus,
  label,
  previousSlug,
  description,
  required = false,
  errorMessage,
  subComponent,
}: SlugFieldProps) => {
  const form = useFormContext();

  const { mutate: checkSlug } = useMutation({
    mutationFn: checkSlugAvailable,
    onSuccess: (isAvailable) => {
      if (!isAvailable) {
        form.setError('slug', {
          type: 'manual',
          message: errorMessage,
        });
      } else {
        form.clearErrors('slug');
      }
    },
  });

  const slug = useWatch({
    control: form.control,
    name: 'slug',
  });

  useEffect(() => {
    if (slug && slug !== previousSlug) {
      checkSlug(slug);
    }
  }, [slug]);
  return (
    <InputFormField
      control={control}
      name={name}
      onFocus={() => onFocus}
      label={label}
      description={description}
      required={required}
      subComponent={subComponent}
    />
  );
};
