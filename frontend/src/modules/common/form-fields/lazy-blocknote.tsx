import type { FieldValues } from 'react-hook-form';
import type { BlockNoteContentFormFieldProps } from '~/modules/common/form-fields/blocknote';
import { lazyNamed } from '~/utils/lazy-named';
import { tw } from '~/utils/tw';

// `lazyNamed` types the props as any; the wrapper below gives back the field's own, tied to the form's values.
const LazyField = lazyNamed(() => import('~/modules/common/form-fields/blocknote'), 'BlockNoteContentFormField');

/** The input frame for an editor field's root (`baseBlockNoteProps.className`), ringed while focus is inside; each form adds its own left padding. */
export const blockNoteFieldClass = tw(
  'min-h-20 rounded-md border border-input p-3 pr-6 text-sm focus-ring:has-focus-visible:outline-hidden focus-ring:has-focus-visible:ring-2 focus-ring:has-focus-visible:ring-ring focus-ring:has-focus-visible:ring-offset-2 focus-ring:has-focus-visible:ring-offset-background',
);

/** The editor field behind a lazy import. Render it under a `Suspense`, once the form's draft has loaded: the editor keeps the value it mounts on. */
export function LazyBlockNoteContentFormField<TFieldValues extends FieldValues>(props: BlockNoteContentFormFieldProps<TFieldValues>) {
  return <LazyField {...props} />;
}
