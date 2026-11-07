import { FilePlaceholder } from '~/modules/attachment/file-placeholder';
import { Avatar, AvatarFallback, AvatarImage } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';

interface MediaThumbnailProps {
  url?: string | null;
  contentType: string;
  name: string;
  className?: string;
}

/** The image when `url` is an image type; a file icon from the content type when the url is missing, non-image or fails to load. */
export function MediaThumbnail({ url, contentType, name, className }: MediaThumbnailProps) {
  const isImage = !!url && contentType.startsWith('image/');
  const fallback = <FilePlaceholder contentType={contentType} />;

  if (!isImage) return fallback;

  return (
    <Avatar className={cn('bg-muted rounded-md', className)}>
      <AvatarImage src={url ?? undefined} alt={name} draggable={false} />
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}
