import { type ReactNode, Suspense } from 'react';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';

interface DocsSheetOptions {
  id: string;
  title: string;
  trigger: HTMLButtonElement | HTMLAnchorElement;
  content: ReactNode;
}

/** Opens API reference content, such as an operation or a schema, in a right-hand sheet, with a spinner while it suspends. */
export function openDocsSheet({ id, title, trigger, content }: DocsSheetOptions) {
  sheeter.getState().create(
    <Suspense fallback={<Spinner size="lg" className="mt-[40vh]" />}>
      <div className="container pt-3 pb-[50vh]">{content}</div>
    </Suspense>,
    { id, title, triggerRef: { current: trigger }, side: 'right' },
  );
}
