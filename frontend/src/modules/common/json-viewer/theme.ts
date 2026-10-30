import { tw } from '~/utils/tw';

/** Tailwind classes of the viewer's parts. Each color matches its part in `code-theme.ts`, so a schema reads alike as JSON and as code. */
export const jsonViewerTheme = {
  string: tw('text-foreground'),
  number: tw('text-code-number'),
  boolean: tw('text-code-boolean'),
  null: tw('text-muted-foreground'),
  key: tw('text-code-key'),
  bracket: tw('text-faint-foreground group-data-[openapi-mode=schema]/json-viewer:hidden'),
  index: tw('text-muted-foreground text-xs'),
  /** A JSON Schema type keyword */
  schemaType: tw('text-code-type italic'),
  /** Shape of the schema keyword badges: composition, ref and required */
  badge: tw('rounded px-1 py-0.5 text-xs'),
  required: tw('text-faint-foreground'),
  /** Count of matches inside a collapsed node */
  matchBadge: tw('bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200'),
};
