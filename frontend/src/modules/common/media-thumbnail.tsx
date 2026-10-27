import { FilePlaceholder } from '~/modules/attachment/file-placeholder';
import { Avatar, AvatarFallback, AvatarImage } from '~/modules/ui/avatar';
import { cn } from '~/utils/cn';

interface MediaThumbnailProps {
  url?: string | null;
  contentType: string;
  name: string;
  className?: string;
}

/**
 * Renders the image when `url` is an image type; falls back to a content-type-derived file icon when the url
 * is missing, non-image, or fails to load (broken/expired url).
 */
export function MediaThumbnail({ url, contentType, name, className }: MediaThumbnailProps) {
  const isImage = !!url && contentType.startsWith('image/');
  const fallback = <FilePlaceholder contentType={contentType} />;

  if (!isImage) return fallback;

  return (
    <Avatar className={cn('rounded-md bg-muted', className)}>
      <AvatarImage src={url ?? undefined} alt={name} draggable={false} className="group-hover/cell-button:opacity-80" />
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}
