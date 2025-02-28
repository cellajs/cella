import { config } from 'config';
import type React from 'react';
import { useMemo } from 'react';
import FilePlaceholder from '~/modules/attachments/file-placeholder';
import { useLocalFile } from '~/modules/attachments/use-local-file';

interface AttachmentThumbProps {
  url: string;
  contentType: string;
  name: string;
}

const AttachmentThumb: React.FC<AttachmentThumbProps> = ({ url: baseUrl, contentType, name }) => {
  const { localUrl } = useLocalFile(baseUrl, contentType);

  // Use either remote URL or local URL
  const url = useMemo(() => {
    if (baseUrl.startsWith(config.publicCDNUrl)) return `${baseUrl}?width=100&format=avif`;
    if (baseUrl.startsWith('/static/')) return baseUrl;
    return localUrl;
  }, [baseUrl, localUrl]);

  const renderIcon = () => {
    if (url && contentType.includes('image'))
      return <img src={url} draggable="false" alt={name} className="h-8 w-8 bg-muted rounded-md object-cover" loading="lazy" decoding="async" />;
    return <FilePlaceholder fileType={contentType} />;
  };

  return renderIcon();
};

export default AttachmentThumb;
