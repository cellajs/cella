import slugify from 'slugify';

export function cleanFileName(name: string): string {
  const originalName = name || 'na';
  const lastDotIndex = originalName.lastIndexOf('.');

  const hasExtension = lastDotIndex !== -1;
  const baseName = hasExtension ? originalName.slice(0, lastDotIndex) : originalName;
  const extension = hasExtension ? originalName.slice(lastDotIndex) : '';

  const cleanBaseName = slugify(baseName, {
    lower: true,
    strict: true,
    replacement: '-',
  });

  return `${cleanBaseName}${extension}`;
}
