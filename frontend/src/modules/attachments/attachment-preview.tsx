import { useMemo } from 'react';
import FilePlaceholder from '~/modules/attachments/preview-placeholder';
import { useLocalFile } from '~/modules/attachments/use-local-file';

interface Props {
  id: string;
  url: string;
  contentType: string;
  name: string;
}

const AttachmentPreview = ({ id, url: baseUrl, contentType, name }: Props) => {
  const { localUrl } = useLocalFile(id, contentType);

  // Use either remote URL or local URL
  const url = useMemo(() => {
    return localUrl.length ? localUrl : baseUrl;
  }, [baseUrl, localUrl]);

  return url && contentType.includes('image') ? (
    <img src={url} draggable="false" alt={name} className="h-8 w-8 bg-muted rounded-md object-cover" loading="lazy" decoding="async" />
  ) : (
    <FilePlaceholder contentType={contentType} />
  );
};

export default AttachmentPreview;
