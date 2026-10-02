import { type ComponentProps, type ReactNode, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ProductEntityType } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { BlockNote } from '~/modules/common/blocknote/blocknote-editor';
import { UploadHostProvider } from '~/modules/common/blocknote/custom-file-panel/upload-host';
import { useYjsToken } from '~/modules/common/blocknote/hooks/use-yjs-token';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { useYjsConnection } from '~/modules/common/blocknote/yjs-connections';
import { useCurrentUser } from '~/modules/user/user-store';
import { getRandomColor } from '~/utils/random-color';

// BlockNote's props are a union (filePanel variants), so Omit must distribute over it
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type PassthroughProps = DistributiveOmit<ComponentProps<typeof BlockNote>, 'collaboration' | 'defaultValue' | 'updateData' | 'onBeforeLoad' | 'id'>;

type CollaborativeBlockNoteProps = PassthroughProps & {
  entityType: ProductEntityType;
  entityId: string;
  tenantId: string;
  organizationId: string;
  /** Unconditional update permission. Without it the static shows, and no token is fetched or connection opened; the relay re-verifies. */
  canEdit: boolean;
  /** Stored description blocks, which the static renders: the entity row's source of truth outside a session. */
  description: string | null;
  /** Commits the editor's document: a cache patch while collaborative, a REST write for a type with Yjs off. */
  updateData: (description: string, collaborative: boolean) => Promise<void> | void;
  /** The static, shown whenever no live editor is; `null` renders none. Defaults to `description` rendered as HTML. */
  waitingFallback?: ReactNode;
};

/** How long a connection may take before the static says it is connecting: a quick one shows no notice, so its swap to the editor does not reflow. */
const CONNECTING_NOTICE_MS = 1_000;

/** Whether descriptions save through the Yjs relay: one save mode for every type, fixed by config. */
const isYjsEnabled = () => appConfig.services.yjs.enabled && !!appConfig.yjsUrl;

/** One line above the description saying why it is read-only, or what happens to its edits. */
function SyncStatus({ text }: { text: string }) {
  return (
    <p role="status" className="mb-2 text-muted-foreground text-sm">
      {text}
    </p>
  );
}

/**
 * BlockNote host for an entity description, with one save mode fixed by config. With Yjs on, edits save through the
 * relay alone: the live editor shows once its connection synced, and until then the static, with a status saying why
 * (connecting, offline, refused). A connection the relay ended for good leaves its editor read-only with a notice: its
 * document may hold edits nobody saved. With Yjs off, a standalone editor writes through `updateData`. Without edit
 * rights, the static alone.
 */
export function CollaborativeBlockNote(props: CollaborativeBlockNoteProps) {
  const { entityId, tenantId, organizationId, description, canEdit, waitingFallback, className, dense, clickOpensPreview } = props;

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
  const host = isYjsEnabled() ? <CollaborativeHost {...props} staticView={staticView} /> : <StandaloneHost {...props} />;

  // The upload dialog renders above the editor so it survives an editor remount.
  const uploadHostProps = props.baseFilePanelProps;
  return uploadHostProps ? <UploadHostProvider baseFilePanelProps={uploadHostProps}>{host}</UploadHostProvider> : host;
}

/** The live editor once the connection synced, the static with a status until then. */
function CollaborativeHost({
  entityType,
  entityId,
  tenantId,
  organizationId,
  canEdit: _canEdit,
  description: _description,
  updateData,
  waitingFallback: _waitingFallback,
  staticView,
  ...blockNoteProps
}: CollaborativeBlockNoteProps & { staticView: ReactNode }) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isOnline = useOnlineManager();
  // Stable random color for cursor labels
  const [userColor] = useState(getRandomColor);

  // The token names this entity only; the relay closes the socket when it expires, and the refreshed token reconnects it.
  const { token, refused } = useYjsToken({ entityType, entityId, tenantId, organizationId, enabled: isOnline });

  // Once synced, the connection stays for the mount, also when its token is refused: a stopped editor shows what was typed.
  const [joined, setJoined] = useState<string | null>(null);
  const yjsConn = useYjsConnection(token || joined === entityId ? entityId : undefined, entityType, tenantId);
  if (yjsConn?.synced && joined !== entityId) setJoined(entityId);

  const stopped = yjsConn?.stopped ?? false;
  const connecting = isOnline && !refused && !stopped && !yjsConn?.synced;
  const [connectingNoticed, setConnectingNoticed] = useState(false);
  useEffect(() => {
    if (!connecting) return;
    const timer = setTimeout(() => setConnectingNoticed(true), CONNECTING_NOTICE_MS);
    return () => {
      clearTimeout(timer);
      setConnectingNoticed(false);
    };
  }, [connecting]);

  // Not synced yet, or a reseeded document syncing afresh: nothing was typed into it, so the editor that replaces the
  // static once it synced loses nothing.
  if (!yjsConn?.synced) {
    const status = stopped
      ? t('c:collaboration_stopped.text')
      : refused
        ? t('c:read_only')
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

  // Nothing typed after the relay ended the session could reach it, so the editor stops taking edits. Offline, it takes
  // them in memory, and the connection keeps them until the relay saved them.
  const status = stopped ? t('c:collaboration_stopped.text') : !isOnline && yjsConn.unsynced ? t('c:collaboration_offline.text') : null;
  return (
    <>
      {status && <SyncStatus text={status} />}
      <BlockNote
        // New per rebuilt document, so the editor binds the fresh fragment.
        key={yjsConn.rebuilds}
        id={`blocknote-${entityId}`}
        updateData={(blocks) => void updateData(blocks, true)}
        collaboration={{ provider: yjsConn.provider, fragment: yjsConn.fragment, user: { name: user.name, color: userColor } }}
        {...blockNoteProps}
        editable={blockNoteProps.editable !== false && !stopped}
      />
    </>
  );
}

/**
 * The editor of a type with Yjs off, built from `description` and writing through `updateData`. Unmount and navigation
 * commit only after a user change; navigation compares with the description current then.
 */
function StandaloneHost({
  entityType: _entityType,
  entityId,
  tenantId: _tenantId,
  organizationId: _organizationId,
  canEdit: _canEdit,
  description,
  updateData,
  waitingFallback: _waitingFallback,
  ...blockNoteProps
}: CollaborativeBlockNoteProps) {
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
