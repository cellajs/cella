import { Control } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel } from '~/modules/ui/form';
import { UploadAvatar } from '../upload/upload-avatar';

interface Props {
  control: Control;
  name: string;
  label: string;
  entity: {
    id?: string;
    name?: string | null;
  };
  type: Parameters<typeof UploadAvatar>[0]['type'];
  url?: string | null;
  setUrl: (url: string) => void;
}

const AvatarFormField = ({ control, label, name, entity, type, url, setUrl }: Props) => (
  <FormField
    control={control}
    name={name}
    render={({ field: { ref, ...rest } }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <UploadAvatar {...rest} type={type} id={entity.id} name={entity.name} url={url} setUrl={setUrl} />
        </FormControl>
      </FormItem>
    )}
  />
);

export default AvatarFormField;
