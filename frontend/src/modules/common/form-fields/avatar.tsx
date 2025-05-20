import { config } from 'config';
import type { UseFormReturn } from 'react-hook-form';
import { UploadAvatar } from '~/modules/attachments/upload/upload-avatar';
import { FormControl, FormField, FormItem, FormLabel } from '~/modules/ui/form';

interface Props {
  form: UseFormReturn;
  name: string;
  label: string;
  entity: {
    id?: string;
    name?: string | null;
  };
  type: Parameters<typeof UploadAvatar>[0]['type'];
}

const AvatarFormField = ({ form, label, name, entity, type }: Props) => {
  const { control } = form;
  const url = form.getValues(name);
  const updateImageUrl = (key: string | null) => {
    const urlWithPublicCDN = key ? `${config.publicCDNUrl}/${key}` : null;
    form.setValue(name, urlWithPublicCDN, { shouldDirty: true });
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { ref, ...rest } }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <UploadAvatar {...rest} type={type} id={entity.id} name={entity.name} url={url} setUrl={updateImageUrl} />
          </FormControl>
        </FormItem>
      )}
    />
  );
};

export default AvatarFormField;
