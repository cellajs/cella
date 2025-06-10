import FilePlaceholder from '~/modules/attachments/table/preview/placeholder';
import { useAttachmentUrl } from '../../use-attachment-url';

interface Props {
  id: string;
  url: string;
  contentType: string;
  name: string;
}

const AttachmentPreview = ({ id, url: baseUrl, contentType, name }: Props) => {
  const { url, error } = useAttachmentUrl(id, baseUrl, contentType);

  if (!url || error) return <FilePlaceholder contentType={contentType} />;

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
