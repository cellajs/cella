import { TiptapCollabProvider } from '@hocuspocus/provider';
import { useLayoutEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';

import { BlockEditor } from './components/BlockEditor';

// export interface AiState {
//   isAiLoading: boolean
//   aiError?: string | null
// }

export default function Tiptap() {
  const [provider, setProvider] = useState<TiptapCollabProvider | null>(null);
  const [collabToken] = useState<string | null>('testToken');
  // const [aiToken, setAiToken] = useState<string | null>(null)

  const hasCollab = false;

  const room = 'testRoom';

  // useEffect(() => {
  //   // fetch data
  //   const dataFetch = async () => {
  //     const data = await (
  //       await fetch('/api/collaboration', {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //       })
  //     ).json();

  //     const { token } = data;

  //     // set state when the data received
  //     setCollabToken(token);
  //   };

  //   dataFetch();
  // }, []);

  // useEffect(() => {
  //   // fetch data
  //   const dataFetch = async () => {
  //     const data = await (
  //       await fetch('/api/ai', {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //       })
  //     ).json()

  //     const { token } = data

  //     // set state when the data received
  //     setAiToken(token)
  //   }

  //   dataFetch()
  // }, [])

  const ydoc = useMemo(() => new Y.Doc(), []);

  useLayoutEffect(() => {
    if (hasCollab && collabToken) {
      setProvider(
        new TiptapCollabProvider({
          name: `${process.env.NEXT_PUBLIC_COLLAB_DOC_PREFIX}${room}`,
          appId: process.env.NEXT_PUBLIC_TIPTAP_COLLAB_APP_ID ?? '',
          token: collabToken,
          document: ydoc,
        }),
      );
    }
  }, [setProvider, collabToken, ydoc, room, hasCollab]);

  if (hasCollab && (!collabToken || !provider)) return; // || !aiToken

  return <BlockEditor aiToken={'aiTokenHere'} hasCollab={hasCollab} ydoc={ydoc} provider={provider} />;
}
