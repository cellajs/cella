import type { ComponentType } from 'react';
import type { FieldValues } from 'react-hook-form';
import type { BlockNoteContentFormFieldProps } from '~/modules/common/form-fields/blocknote';
import { lazyNamed } from '~/utils/lazy-named';
import { tw } from '~/utils/tw';

// biome-ignore lint/suspicious/noExplicitAny: `lazy` loses the field's type parameter, which the wrapper below restores.
const LazyField: ComponentType<any> = lazyNamed(() => import('~/modules/common/form-fields/blocknote'), 'BlockNoteContentFormField');

/** The input frame for an editor field's root (`baseBlockNoteProps.className`), ringed while focus is inside; a form sets its side-menu gutter with `--bn-field-inset`. */
export const blockNoteFieldClass = tw('bn-field focus-within-effect rounded-md border border-input field-hover:border-input-hover text-sm');

/** The editor field behind a lazy import. Render it under a `Suspense`, once the form's draft has loaded: the editor keeps the value it mounts on. */
export function LazyBlockNoteContentFormField<TFieldValues extends FieldValues>(props: BlockNoteContentFormFieldProps<TFieldValues>) {
  return <LazyField {...props} />;
}
