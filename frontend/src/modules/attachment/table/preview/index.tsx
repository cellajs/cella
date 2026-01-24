import FilePlaceholder from '~/modules/attachment/table/preview/placeholder';

interface Props {
  contentType: string;
  name: string;
  url?: string;
}

// TODO review mb move quey here out of column
function AttachmentPreview({ url, contentType, name }: Props) {
  if (!url || !contentType.startsWith('image/')) return <FilePlaceholder contentType={contentType} />;

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
}

export default AttachmentPreview;
