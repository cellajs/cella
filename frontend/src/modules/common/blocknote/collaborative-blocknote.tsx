import { type ComponentProps, type ReactNode, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { BlockNote } from '~/modules/common/blocknote/blocknote-editor';
import { UploadHostProvider } from '~/modules/common/blocknote/custom-file-panel/upload-host';
import { useYjsToken } from '~/modules/common/blocknote/hooks/use-yjs-token';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import type { YjsDocScope } from '~/modules/common/blocknote/query';
import { useYjsConnection } from '~/modules/common/blocknote/yjs-connections';
import { isYjsEnabled, useStoredYDoc } from '~/modules/common/blocknote/yjs-store';
import { useCurrentUser } from '~/modules/user/user-store';
import { getRandomColor } from '~/utils/random-color';

// BlockNote's props are a union (filePanel variants), so Omit must distribute over it
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type PassthroughProps = DistributiveOmit<ComponentProps<typeof BlockNote>, 'collaboration' | 'defaultValue' | 'updateData' | 'onBeforeLoad' | 'id'>;

type CollaborativeBlockNoteProps = PassthroughProps &
  YjsDocScope & {
    /** Unconditional update permission. Without it the static shows, and no token is fetched or connection opened; the relay re-verifies. */
    canEdit: boolean;
    /** Stored description blocks, which the static renders: the entity row's source of truth outside a session. */
    description: string | null;
    /** Commits the editor's document: a cache patch while collaborative, a REST write for a type with Yjs off. */
    updateData: (description: string, collaborative: boolean) => Promise<void> | void;
    /** The static, shown whenever no live editor is; `null` renders none. Defaults to `description` rendered as HTML. */
    waitingFallback?: ReactNode;
  };

type CollaborativeHostProps = PassthroughProps & Pick<CollaborativeBlockNoteProps, 'updateData'> & { scope: YjsDocScope; staticView: ReactNode };

type StandaloneHostProps = PassthroughProps & Pick<CollaborativeBlockNoteProps, 'entityId' | 'description' | 'updateData'>;

/** How long a connection may take before the static says it is connecting: a quick one shows no notice, so its swap to the editor does not reflow. */
const connectingNoticeMs = 1_000;

interface SyncStatusProps {
  text: string;
}

/** One line above the description saying why it is read-only, or what happens to its edits. */
function SyncStatus({ text }: SyncStatusProps) {
  return (
    <p role="status" className="mb-2 text-muted-foreground text-sm">
      {text}
    </p>
  );
}

/**
 * BlockNote host for an entity description, with one save mode fixed by config. With Yjs on, edits save through the
 * relay, or through the API's HTTP routes while the relay is out of reach: the live editor shows once its connection is
 * ready (synced, or loaded from storage), and until then the static, with a status saying why (connecting, offline).
 * Lost edit rights, a deleted entity and a refused document show the static, saying so. With Yjs off, a standalone
 * editor writes through `updateData`. Without edit rights, the static alone.
 */
export function CollaborativeBlockNote({
  entityType,
  entityId,
  tenantId,
  organizationId,
  canEdit,
  description,
  updateData,
  waitingFallback,
  ...blockNoteProps
}: CollaborativeBlockNoteProps) {
  const { className, dense, clickOpensPreview, baseFilePanelProps } = blockNoteProps;

  const descriptionHtml = (
    <Suspense fallback={null}>
      <BlockNoteFullHtml
        id={`blocknote-${entityId}-static`}
        defaultValue={description ?? ''}
        tenantId={tenantId}
        organizationId={organizationId}
        className={className}
        dense={dense}
        clickOpensPreview={clickOpensPreview}
      />
    </Suspense>
  );
  const staticView = waitingFallback === undefined ? descriptionHtml : waitingFallback;

  if (!canEdit) return staticView;
  const host = isYjsEnabled() ? (
    <CollaborativeHost
      {...blockNoteProps}
      scope={{ entityType, entityId, tenantId, organizationId }}
      updateData={updateData}
      staticView={staticView}
    />
  ) : (
    <StandaloneHost {...blockNoteProps} entityId={entityId} description={description} updateData={updateData} />
  );

  // The upload dialog renders above the editor so it survives an editor remount.
  return baseFilePanelProps ? <UploadHostProvider baseFilePanelProps={baseFilePanelProps}>{host}</UploadHostProvider> : host;
}

/** The live editor once the connection is ready, the static with a status until then and once the document cannot be edited. */
function CollaborativeHost({ scope, updateData, staticView, ...blockNoteProps }: CollaborativeHostProps) {
  const { entityId } = scope;
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isOnline = useOnlineManager();
  // Stable random color for cursor labels
  const [userColor] = useState(getRandomColor);

  // The token names this entity only; the relay closes the socket when it expires, and the refreshed token reconnects it.
  const { token, denied: tokenDenied, deleted: tokenDeleted } = useYjsToken({ ...scope, enabled: isOnline });

  // A stored document opens without a token, offline too: its editor mounts from storage.
  const stored = useStoredYDoc(scope)?.stored ?? false;
  // Once ready, the connection stays for the mount, also when its token is refused: a stopped editor shows what was typed.
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const connection = useYjsConnection({ ...scope, enabled: !!token || stored || joinedId === entityId });
  if (connection?.ready && joinedId !== entityId) setJoinedId(entityId);

  const stopped = connection?.stopped ?? false;
  const stopReason = connection?.stopReason ?? null;
  // The token or HTTP routes answered 404, or the relay closed with 4410: the document went with the entity.
  const deleted = tokenDeleted || (connection?.deleted ?? false);
  // Edit rights withdrawn: the token or HTTP routes answered 403, or the relay closed with 4003.
  const denied = tokenDenied || stopReason === 'denied';
  const stoppedText = stopReason === 'expired' ? t('error:sync_token_expired.text') : t('c:collaboration_stopped.text');
  // Not ready yet, or ready from storage before either transport synced it.
  const connecting = isOnline && !denied && !deleted && !stopped && (!connection?.ready || connection.transport === 'none');
  const [connectingNoticed, setConnectingNoticed] = useState(false);
  useEffect(() => {
    if (!connecting) return;
    const timer = setTimeout(() => setConnectingNoticed(true), connectingNoticeMs);
    return () => {
      clearTimeout(timer);
      setConnectingNoticed(false);
    };
  }, [connecting]);

  // Not ready yet, or a reseeded document syncing afresh: nothing was typed into it, so the editor that replaces the
  // static once it is ready loses nothing. A deleted entity, lost rights or a refused document leave nothing to edit:
  // edits the server never saved are offered as a copy, outside the editor.
  if (!connection?.ready || deleted || denied || stopReason === 'refused') {
    const status = deleted
      ? t('c:deleted')
      : denied
        ? t('c:read_only')
        : stopped
          ? stoppedText
          : !isOnline
            ? t('c:offline')
            : connectingNoticed
              ? t('c:connecting')
              : null;
    return (
      <>
        {status && <SyncStatus text={status} />}
        {staticView}
      </>
    );
  }

  // Nothing typed after the session ended could reach a server, so the editor stops taking edits. Offline, it takes
  // them, and the connection keeps them until a server saved them. Over HTTP, peers' edits arrive with each pull.
  const status = stopped
    ? stoppedText
    : !isOnline
      ? t(connection.unsynced ? 'c:collaboration_offline.text' : 'c:offline')
      : connection.transport === 'http'
        ? t('c:sync_limited.text')
        : connectingNoticed
          ? t('c:connecting')
          : null;
  return (
    <>
      {status && <SyncStatus text={status} />}
      {/* Storing failed for good: unsynced edits live in this page only, and the unload warning asks. */}
      {connection.storageFailed && <SyncStatus text={t('c:storage_unavailable.text')} />}
      <BlockNote
        // New per rebuilt document, so the editor binds the fresh fragment.
        key={connection.rebuilds}
        id={`blocknote-${entityId}`}
        updateData={(blocks) => void updateData(blocks, true)}
        collaboration={{ provider: { awareness: connection.awareness }, fragment: connection.fragment, user: { name: user.name, color: userColor } }}
        {...blockNoteProps}
        // Opened for editing: from the first focus on, the document is stored and stays editable offline.
        onFocus={() => {
          connection.markStored();
          blockNoteProps.onFocus?.();
        }}
        editable={blockNoteProps.editable !== false && !stopped}
      />
    </>
  );
}

/**
 * The editor of a type with Yjs off, built from `description` and writing through `updateData`. Unmount and navigation
 * commit only after a user change; navigation compares with the description current then.
 */
function StandaloneHost({ entityId, description, updateData, ...blockNoteProps }: StandaloneHostProps) {
  return (
    <BlockNote
      id={`blocknote-${entityId}`}
      defaultValue={description ?? undefined}
      updateData={(blocks) => void updateData(blocks, false)}
      onBeforeLoad={(editor) => {
        const strBlocks = JSON.stringify(editor.document);
        if (strBlocks !== description) void updateData(strBlocks, false);
      }}
      {...blockNoteProps}
    />
  );
}
