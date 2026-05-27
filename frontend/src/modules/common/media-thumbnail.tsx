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
 * Thumbnail for an attachment / media file.
 *
 * Renders the image when `url` is set and `contentType` is an image type.
 * Falls back to a content-type-derived file icon when the url is missing,
 * the type is non-image, or the image fails to load (broken/expired url).
 */
export function MediaThumbnail({ url, contentType, name, className }: MediaThumbnailProps) {
  const isImage = !!url && contentType.startsWith('image/');
  const fallback = <FilePlaceholder contentType={contentType} />;

  if (!isImage) return fallback;

  return (
    <Avatar className={cn('h-8 w-8 rounded-md bg-muted', className)}>
      <AvatarImage
        src={url ?? undefined}
        alt={name}
        draggable={false}
        className="object-cover group-hover:opacity-80 group-active:translate-y-[.05rem]"
      />
      <AvatarFallback className="rounded-md bg-muted">{fallback}</AvatarFallback>
    </Avatar>
  );
}
