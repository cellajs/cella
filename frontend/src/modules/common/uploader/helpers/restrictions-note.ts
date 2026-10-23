import i18n, { t } from 'i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { CustomUppyOptions } from '~/modules/common/uploader/types';

/** File kinds by the types that name them; any other type is a file. */
const kindTypes: [TKey, string[]][] = [
  ['c:image_other', ['image/*', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']],
  ['c:video_other', ['video/*', '.mp4', '.mov', '.avi', '.mkv', '.webm']],
  ['c:audio', ['audio/*', '.mp3', '.wav', '.ogg', '.m4a']],
];
const everyKind: TKey[] = [...kindTypes.map(([kind]) => kind), 'c:file_other'];

const kindOf = (type: string) => kindTypes.find(([, types]) => types.includes(type))?.[0] ?? 'c:file_other';

const formatList = (kinds: TKey[], type: Intl.ListFormatType) =>
  new Intl.ListFormat(i18n.resolvedLanguage, { type }).format(kinds.map((kind) => t(kind)));

/** The Dashboard note: the file kinds, the number of files and the size each may have. */
export const generateRestrictionNote = ({ allowedFileTypes, maxNumberOfFiles, maxFileSize }: Partial<CustomUppyOptions['restrictions']>) => {
  const kinds = allowedFileTypes?.includes('*/*') ? everyKind : [...new Set((allowedFileTypes ?? []).map(kindOf))];

  const parts: string[] = [];
  if (kinds.length === everyKind.length) parts.push(formatList(kinds, 'unit'));
  else if (kinds.length) parts.push(t('c:upload_note.only', { kinds: formatList(kinds, 'conjunction') }));
  if (maxNumberOfFiles != null) parts.push(t('c:upload_note.max_files', { count: maxNumberOfFiles }));
  if (maxFileSize != null) {
    const size = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 });
    parts.push(t('c:upload_note.max_size', { size: size.format(maxFileSize / 1024 / 1024) }));
  }

  return parts.length ? `${parts.join(', ')}.` : '';
};
