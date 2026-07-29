import i18n from 'i18next';
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { BlockNote } from '~/modules/common/blocknote/blocknote-editor';
import { UploadHostProvider } from '~/modules/common/blocknote/custom-file-panel/upload-host';
import { useYjsConnection } from '~/modules/common/blocknote/yjs-connections';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useCurrentUser, useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import { getRandomColor } from '~/utils/random-color';

// BlockNote's props are a union (filePanel variants), so Omit must distribute over it
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type PassthroughProps = DistributiveOmit<
  ComponentProps<typeof BlockNote>,
  'collaboration' | 'defaultValue' | 'updateData' | 'onBeforeLoad' | 'id'
>;

type CollaborativeBlockNoteProps = PassthroughProps & {
  entityType: ProductEntityType;
  entityId: string;
  tenantId: string;
  /** Unconditional update permission; collaboration only activates when it holds (the relay re-verifies). */
  canEdit: boolean;
  /** Stored description blocks (the entity row's source of truth outside a session). */
  description: string | null;
  /** Persistence policy; receives the live collaboration state per call. */
  updateData: (description: string, collaborative: boolean) => Promise<void> | void;
  /** Rendered while waiting for the first WS sync (avoids an empty flash). Defaults to a spinner. */
  waitingFallback?: ReactNode;
};

/**
 * BlockNote host for an entity description with optional Yjs collaboration. Owns the
 * token/online/permission gates, the relay connection, the brief sync-wait before
 * standalone fallback, and the standalone reconcile of unsaved editor content on load.
 */
export function CollaborativeBlockNote({
  entityType,
  entityId,
  tenantId,
  canEdit,
  description,
  updateData,
  waitingFallback,
  ...blockNoteProps
}: CollaborativeBlockNoteProps) {
  const user = useCurrentUser();

  const tokenKey = yjsTokenKey(entityType, tenantId);
  const yjsToken = useUserStore((s) => s.yjsTokens[tokenKey]);
  const isOnline = useOnlineManager();
  const canCollaborate = !!appConfig.yjsUrl && isOnline && !!yjsToken && canEdit;

  // Latch the collaboration mode for this mounted editor's lifetime (see below). Read the committed
  // value first so once collaborative we keep the Yjs connection alive across a transient offline blip;
  // releasing it would let the grace period destroy the shared doc under a still-mounted editor.
  const committedRef = useRef<'collab' | 'solo' | null>(null);
  const keepConnection = canCollaborate || committedRef.current === 'collab';

  // Connect to the Yjs relay; the connection manager handles ref-counting and grace periods.
  // The token proves update permission; entity-level access is verified asynchronously.
  const yjsConn = useYjsConnection(keepConnection ? entityId : undefined, entityType, tenantId);
  const wsReady = yjsConn?.synced ?? false;

  // Wait briefly for WS sync before falling back to standalone mode.
  // This avoids mounting the editor twice (standalone -> collaborative).
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const toastShownRef = useRef(false);
  useEffect(() => {
    if (!canCollaborate || wsReady) return;
    const timer = setTimeout(() => {
      setSyncTimedOut(true);
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        toaster.warning(i18n.t('error:sync_failed.text'));
      }
    }, 3_000);
    return () => clearTimeout(timer);
  }, [canCollaborate, wsReady]);

  // useCreateBlockNote captures the Yjs config at creation, so switching solo<->collab means a full
  // editor remount that discards an open upload dialog and any text typed before the first sync.
  // Commit the mode once (collab when the first sync lands, solo when we stop waiting or cannot
  // collaborate) and hold it for this editor's lifetime; a later online/token/sync change no longer
  // remounts. Reopening the editor mounts fresh and re-evaluates from scratch.
  const liveCollaborative = canCollaborate && wsReady;
  if (committedRef.current === null) {
    if (liveCollaborative) committedRef.current = 'collab';
    else if (!canCollaborate || syncTimedOut) committedRef.current = 'solo';
  }
  const committed = committedRef.current;
  const waitingForSync = committed === null;
  const collaborative = committed === 'collab';

  // Stable random color for cursor labels
  const userColorRef = useRef(getRandomColor());

  const collaborationBundle =
    collaborative && yjsConn
      ? {
          provider: yjsConn.provider,
          fragment: yjsConn.fragment,
          user: { name: user.name, color: userColorRef.current },
          entityType,
          entityId,
        }
      : undefined;

  if (waitingForSync) return waitingFallback ?? <Spinner className="my-8 h-6 w-6 opacity-50" />;

  const uploadHostProps = blockNoteProps.baseFilePanelProps;

  const editor = (
    <BlockNote
      // The mode is latched for this mount, so this key is stable; it still guards against ever
      // reusing a standalone editor instance as collaborative.
      key={collaborative ? 'collab' : 'solo'}
      id={`blocknote-${entityId}`}
      defaultValue={description ?? undefined}
      updateData={(blocks) => void updateData(blocks, collaborative)}
      collaboration={collaborationBundle}
      onBeforeLoad={
        collaborative
          ? undefined
          : (editor) => {
              const strBlocks = JSON.stringify(editor.document);
              if (description === null || strBlocks === description) return;
              void updateData(strBlocks, collaborative);
            }
      }
      {...blockNoteProps}
    />
  );

  // Hoist the upload dialog above the editor so it survives any editor remount (defense in depth
  // beyond the latch). Only needed when this editor accepts uploads.
  return uploadHostProps ? (
    <UploadHostProvider baseFilePanelProps={uploadHostProps}>{editor}</UploadHostProvider>
  ) : (
    editor
  );
}
