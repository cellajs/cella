/** The kinds a file's content type sorts it into: each has its icon and word in the app and its link preview image. */
export const fileKindNames = [
  'spreadsheet',
  'presentation',
  'archive',
  'image',
  'video',
  'audio',
  'json',
  'pdf',
  'document',
  'text',
  'file',
] as const;

export type FileKindName = (typeof fileKindNames)[number];

/** The first match wins, so every family comes before the document catch-all (`vnd`, `text`). */
const kindMatches: [FileKindName, string[]][] = [
  ['spreadsheet', ['spreadsheet', 'excel', 'csv']],
  ['presentation', ['presentation', 'powerpoint']],
  ['archive', ['zip', 'rar']],
  ['image', ['image']],
  ['video', ['video']],
  ['audio', ['audio']],
  ['json', ['json']],
  ['pdf', ['pdf']],
  ['document', ['msword', 'vnd']],
  ['text', ['text']],
];

/** The kind of a file by its content type; `file` for an unknown or absent one. */
export const fileKindOf = (contentType?: string | null): FileKindName =>
  (contentType && kindMatches.find(([, match]) => match.some((type) => contentType.includes(type)))?.[0]) || 'file';
