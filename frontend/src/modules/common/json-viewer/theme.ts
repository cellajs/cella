import { tw } from '~/utils/tw';

/** Tailwind classes of the viewer's parts. */
export const jsonViewerTheme = {
  string: tw('text-foreground'),
  number: tw('text-amber-700 dark:text-amber-400'),
  boolean: tw('text-rose-700 dark:text-rose-400'),
  null: tw('text-muted-foreground'),
  key: tw('text-emerald-700 dark:text-emerald-400'),
  bracket: tw('font-medium text-gray-700 group-data-[openapi-mode=schema]/json-viewer:hidden dark:text-gray-300'),
  index: tw('text-muted-foreground text-xs'),
  schemaType: tw('font-medium italic'),
  /** Type keywords other than the primitive ones (array, object) */
  structureType: tw('text-purple-600 dark:text-purple-400'),
  /** Shape of the schema keyword badges: composition, ref and required */
  badge: tw('rounded px-1 py-0.5 font-medium text-xs'),
  required: tw('bg-amber-100/50 text-amber-700/60 dark:bg-amber-900/10 dark:text-amber-200/60'),
  /** Count of matches inside a collapsed node */
  matchBadge: tw('bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200'),
};

/** Color class for a JSON Schema type keyword. */
export function getTypeColorClass(type: string): string {
  if (type === 'string') return jsonViewerTheme.string;
  if (type === 'number' || type === 'integer') return jsonViewerTheme.number;
  if (type === 'boolean') return jsonViewerTheme.boolean;
  if (type === 'null') return jsonViewerTheme.null;
  return jsonViewerTheme.structureType;
}
