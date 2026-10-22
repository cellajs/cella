import type React from 'react';

/** Vendored from jsx-email v3.2.1 (MIT), excluding CLI-only types and globals. */
export type BaseProps<TElement extends React.ElementType> = React.ComponentPropsWithoutRef<TElement> & { disableDefaultStyle?: boolean };

export type JsxEmailComponent<TProps extends BaseProps<any>> = React.FC<Readonly<TProps>>;
