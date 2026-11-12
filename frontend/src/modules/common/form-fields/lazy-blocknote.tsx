import type { ComponentType } from 'react';
import type { FieldValues } from 'react-hook-form';
import type { BlockNoteContentFormFieldProps } from '~/modules/common/form-fields/blocknote';
import { lazyNamed } from '~/utils/lazy-named';

// biome-ignore lint/suspicious/noExplicitAny: `lazy` loses the field's type parameter, which the wrapper below restores.
const LazyField: ComponentType<any> = lazyNamed(() => import('~/modules/common/form-fields/blocknote'), 'BlockNoteContentFormField');

/** The editor field behind a lazy import. Render it under a `Suspense`, once the form's draft has loaded: the editor keeps the value it mounts on. */
export function LazyBlockNoteContentFormField<TFieldValues extends FieldValues>(props: BlockNoteContentFormFieldProps<TFieldValues>) {
  return <LazyField {...props} />;
}
