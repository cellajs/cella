/** Tailwind classes of the viewer's parts. */
export const jsonViewerTheme = {
  string: 'text-foreground',
  number: 'text-amber-700 dark:text-amber-400',
  boolean: 'text-rose-700 dark:text-rose-400',
  null: 'text-muted-foreground',
  key: 'text-emerald-700 dark:text-emerald-400',
  /** Hidden in schema mode */
  bracket: 'font-medium text-gray-700 group-data-[openapi-mode=schema]/json-viewer:hidden dark:text-gray-300',
  index: 'text-muted-foreground text-xs',
  schemaType: 'font-medium italic',
  /** Type keywords other than the primitive ones (array, object) */
  structureType: 'text-purple-600 dark:text-purple-400',
  required: 'bg-amber-100/50 dark:bg-amber-900/10 text-amber-700/60 dark:text-amber-200/60',
  /** Count of matches inside a collapsed node */
  matchBadge: 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200',
};

/** Color class for a JSON Schema type keyword, shared by schema labels and schema-mode values. */
export function getTypeColorClass(type: string): string {
  if (type === 'string') return jsonViewerTheme.string;
  if (type === 'number' || type === 'integer') return jsonViewerTheme.number;
  if (type === 'boolean') return jsonViewerTheme.boolean;
  if (type === 'null') return jsonViewerTheme.null;
  return jsonViewerTheme.structureType;
}
