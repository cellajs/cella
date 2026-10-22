import type { FieldValues } from 'react-hook-form';
import type { BlockNoteContentFormFieldProps } from '~/modules/common/form-fields/blocknote';
import { lazyNamed } from '~/utils/lazy-named';

// `lazyNamed` types the props as any; the wrapper below gives back the field's own, tied to the form's values.
const LazyField = lazyNamed(() => import('~/modules/common/form-fields/blocknote'), 'BlockNoteContentFormField');

/** The editor field behind a lazy import. Render it under a `Suspense`, once the form's draft has loaded: the editor keeps the value it mounts on. */
export function LazyBlockNoteContentFormField<TFieldValues extends FieldValues>(props: BlockNoteContentFormFieldProps<TFieldValues>) {
  return <LazyField {...props} />;
}
