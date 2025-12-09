import { useAttachmentUrl } from '~/modules/attachments/hooks/use-attachment-url';
import FilePlaceholder from '~/modules/attachments/table/preview/placeholder';

interface Props {
  id: string;
  contentType: string;
  name: string;
  url?: string;
}

// TODO review mb move quey here out of column
const AttachmentPreview = ({ id, url: baseUrl, contentType, name }: Props) => {
  if (!baseUrl) return <FilePlaceholder contentType={contentType} />;

  const { url, error } = useAttachmentUrl(id, baseUrl, contentType);

  if (!url || error || !contentType.startsWith('image/')) return <FilePlaceholder contentType={contentType} />;

  return (
    <img
      src={url}
      draggable="false"
      alt={name}
      className="h-8 w-8 bg-muted rounded-md object-cover group-hover:opacity-80 group-active:translate-y-[.05rem]"
      loading="lazy"
      decoding="async"
    />
  );
};

export default AttachmentPreview;
