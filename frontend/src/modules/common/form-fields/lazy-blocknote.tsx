import type { BlockNoteContentFormField } from '~/modules/common/form-fields/blocknote';
import { lazyNamed } from '~/utils/lazy-named';

/** The editor field behind a lazy import. Render it under a `Suspense`, once the form's draft has loaded: the editor keeps the value it mounts on. */
export const LazyBlockNoteContentFormField = lazyNamed(
  () => import('~/modules/common/form-fields/blocknote'),
  'BlockNoteContentFormField',
  // `lazy` drops the type parameter of the field, and with it the tie between its props and the form's values.
) as unknown as typeof BlockNoteContentFormField;
