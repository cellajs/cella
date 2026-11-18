import { createFileRoute } from '@tanstack/react-router';
import { EmbedLayout } from '~/modules/common/embed/embed-layout';
import { embedLayoutBeforeLoad } from '~/modules/common/embed/route-logic';
import { withSuspenseSpinner } from '~/modules/common/with-suspense';

/** The pages an LTI platform shows in its frame, without app chrome: `embedLayoutBeforeLoad` is their session gate, which never sends anyone to sign in. */
export const Route = createFileRoute('/embed')({
  staticData: { boundary: 'app' },
  beforeLoad: ({ cause }) => embedLayoutBeforeLoad(cause),
  component: withSuspenseSpinner(EmbedLayout),
});
