import type { ComponentProps } from 'react';
import { Button } from '~/modules/ui/button';

/** A button that reads as a link inside a sentence, at the sentence's own font size. */
export function InlineLinkButton(props: Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'className'>) {
  return <Button variant="link" size="auto" className="text-[length:inherit]" {...props} />;
}
