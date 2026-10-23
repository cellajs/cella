import type { FieldValues } from 'react-hook-form';
import type { BlockNoteContentFormFieldProps } from '~/modules/common/form-fields/blocknote';
import { lazyNamed } from '~/utils/lazy-named';
import { tw } from '~/utils/tw';

// `lazyNamed` types the props as any; the wrapper below gives back the field's own, tied to the form's values.
const LazyField = lazyNamed(() => import('~/modules/common/form-fields/blocknote'), 'BlockNoteContentFormField');

/** The input frame for an editor field's root (`baseBlockNoteProps.className`); each form adds its own left padding. */
export const blockNoteFieldClass = tw('flex min-h-20 rounded-md border border-input p-3 pr-6 text-sm');

/** The editor field behind a lazy import. Render it under a `Suspense`, once the form's draft has loaded: the editor keeps the value it mounts on. */
export function LazyBlockNoteContentFormField<TFieldValues extends FieldValues>(props: BlockNoteContentFormFieldProps<TFieldValues>) {
  return <LazyField {...props} />;
}
