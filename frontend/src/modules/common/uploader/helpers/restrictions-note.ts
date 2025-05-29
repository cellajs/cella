import { config } from 'config';
import type { CustomUppyOpt } from '~/modules/common/uploader/types';

const typeMap: Record<string, string[]> = {
  Images: ['image/*', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
  Videos: ['video/*', '.mp4', '.mov', '.avi', '.mkv', '.webm'],
  Audio: ['audio/*', '.mp3', '.wav', '.ogg', '.m4a'],
};

const pluralize = (count: number, noun: string) => `${count} ${noun}${count !== 1 ? 's' : ''}`;

const formatCategories = (categories: string[]) => {
  if (categories.length === 1) return `${categories[0]} only`;
  if (categories.length === 4) return categories.join(', ');

  const last = categories[categories.length - 1];
  const rest = categories.slice(0, -1);
  return `${rest.join(', ')} and ${last} only`;
};

export const generateRestrictionNote = (passedRestrictions?: Partial<CustomUppyOpt['restrictions']>): string => {
  const { allowedFileTypes, minNumberOfFiles, maxNumberOfFiles, maxFileSize } = { ...config.uppy.defaultRestrictions, ...passedRestrictions };

  const categories = (() => {
    // If '*/*' is present, allow all categories
    if (allowedFileTypes?.includes('*/*')) return ['Images', 'Videos', 'Audio', 'Files'];

    // Otherwise, map normally
    return Array.from(
      new Set(
        (allowedFileTypes ?? []).map((type) => {
          for (const [category, extensions] of Object.entries(typeMap)) {
            if (extensions.includes(type)) return category;
          }
          return 'Files';
        }),
      ),
    );
  })();

  const parts: string[] = [];

  if (categories.length) parts.push(formatCategories(categories));

  if (minNumberOfFiles != null && maxNumberOfFiles != null) {
    parts.push(minNumberOfFiles === maxNumberOfFiles ? pluralize(maxNumberOfFiles, 'file') : `${minNumberOfFiles}-${maxNumberOfFiles} files`);
  } else if (maxNumberOfFiles != null) {
    parts.push(`up to ${pluralize(maxNumberOfFiles, 'file')}`);
  } else if (minNumberOfFiles != null) {
    parts.push(`at least ${pluralize(minNumberOfFiles, 'file')}`);
  }

  if (maxFileSize != null) {
    const sizeMB = +(maxFileSize / 1024 / 1024).toFixed(1);
    parts.push(`${sizeMB} MB each`);
  }

  return parts.length ? `${parts.join(', ')}.` : '';
};
