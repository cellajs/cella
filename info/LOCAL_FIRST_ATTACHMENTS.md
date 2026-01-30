# Local-first attachment implementation plan

## Overview

Transform the attachment system to be local-first: files always stored locally in IndexedDB first, with optional cloud sync via Transloadit when configured and online.

**Goals:**
- Files work without Transloadit configured
- Files work offline
- Seamless sync when online + cloud available
- React-query cache as source of truth for metadata and to know what to download
- IndexedDB (Dexie) for blob storage and downloadQueue

---

## Current state

### Existing infrastructure
- `attachmentFiles` table: Stores pending uploads with sync metadata
- `attachmentCache` table: Caches downloaded file blobs
- `DexieAttachmentStorage` class: Basic CRUD operations
- `prepareFilesForOffline()`: Creates mock assembly for local files

### Problems
1. `createBaseTransloaditUppy()` always tries to fetch token → fails when no Transloadit key
2. No graceful detection of "cloud unavailable" state
3. Two separate tables with unclear responsibilities
4. No background download of attachments for offline viewing

---

## Phase 1: Dexie schema redesign

### 1.1 Update `attachments-db.ts`

**File:** `frontend/src/modules/attachment/dexie/attachments-db.ts`

**Changes:**
- Replace `attachmentFiles` and `attachmentCache` with unified `blobs` table
- Add `downloadQueue` table for background fetching

**New schema:**

```typescript
/**
 * Blob storage for attachments.
 * 
 * Single table serves two purposes:
 * - 'upload': Files created locally, pending cloud sync
 * - 'download': Files fetched from cloud for offline viewing
 * 
 * React-query attachment cache is the source of truth for metadata.
 * This table only stores the actual blob and sync state.
 */
interface AttachmentBlob {
  /** Matches Attachment.id in react-query cache */
  id: string;
  
  /** Organization scope */
  organizationId: string;
  
  /** The actual file blob */
  blob: Blob;
  
  /** File size in bytes (denormalized for filtering) */
  size: number;
  
  /** MIME type (denormalized for filtering) */
  contentType: string;
  
  /**
   * How this blob was created:
   * - 'upload': User uploaded locally (may need cloud sync)
   * - 'download': Fetched from cloud for offline access
   */
  source: 'upload' | 'download';
  
  /**
   * Sync status (only relevant for source='upload'):
   * - 'pending': Waiting to upload
   * - 'syncing': Currently uploading
   * - 'synced': Uploaded successfully
   * - 'failed': Upload failed after retries
   * - 'local-only': No cloud configured, permanent local
   * 
   * For source='download', always 'synced'
   */
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed' | 'local-only';
  
  /** Upload retry count */
  syncAttempts: number;
  
  /** Next retry timestamp (for exponential backoff) */
  nextRetryAt: Date | null;
  
  /** Last error message */
  lastError: string | null;
  
  /** When blob was stored */
  storedAt: Date;
}

/**
 * Download queue - tracks which attachments to fetch for offline.
 * Separate from blob storage for clean queue management.
 */
interface DownloadQueueEntry {
  /** Matches Attachment.id */
  id: string;
  
  /** Organization scope */
  organizationId: string;
  
  /** Download priority (lower = higher priority) */
  priority: number;
  
  /**
   * Queue status:
   * - 'pending': Waiting to download
   * - 'downloading': Currently fetching
   * - 'completed': Successfully stored in AttachmentBlob
   * - 'failed': Download failed
   * - 'skipped': Skipped due to filter (too large, wrong type)
   */
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';
  
  /** Why skipped (if status='skipped') */
  skipReason: string | null;
  
  /** When added to queue */
  queuedAt: Date;
  
  /** Download attempts */
  attempts: number;
}
```

**Database class:**

```typescript
export class AttachmentsDatabase extends Dexie {
  blobs!: EntityTable<AttachmentBlob, 'id'>;
  downloadQueue!: EntityTable<DownloadQueueEntry, 'id'>;

  constructor() {
    super(`${appConfig.slug}-attachments`);

    this.version(1).stores({
      blobs: '&id, organizationId, source, syncStatus, contentType, [organizationId+source], [organizationId+syncStatus]',
      downloadQueue: '&id, organizationId, status, priority, [organizationId+status]',
    });
  }
}
```

---

## Phase 2: Backend graceful token handling

### 2.1 Update `me-handlers.ts`

**File:** `backend/src/modules/me/me-handlers.ts`

**Changes:**
- Return `params: null, signature: null` when `TRANSLOADIT_KEY` or `TRANSLOADIT_SECRET` not set
- Keep existing logic when configured

**Code change:**

```typescript
.openapi(meRoutes.getUploadToken, async (ctx) => {
  const { public: isPublic, organizationId, templateId } = ctx.req.valid('query');
  const user = getContextUser();

  const sub = [appConfig.s3BucketPrefix, organizationId, user.id]
    .filter((part): part is string => typeof part === 'string')
    .join('/');

  // If Transloadit not configured, return response indicating local-only mode
  if (!env.TRANSLOADIT_KEY || !env.TRANSLOADIT_SECRET) {
    return ctx.json({ 
      sub, 
      public: isPublic, 
      s3: !!env.S3_ACCESS_KEY_ID,
      params: null,
      signature: null,
    }, 200);
  }

  // ... existing Transloadit logic
});
```

---

## Phase 3: Upload flow refactoring

### 3.1 Add upload storage service

**File:** `frontend/src/modules/attachment/dexie/upload-storage.ts` (new)

**Purpose:** Store uploaded blobs locally before/instead of cloud upload

```typescript
/**
 * Upload storage service for local-first file handling.
 */
export class UploadStorage {
  /**
   * Store a blob from Uppy file upload.
   */
  async storeBlob(
    file: CustomUppyFile,
    organizationId: string,
    syncStatus: AttachmentBlob['syncStatus'] = 'pending'
  ): Promise<AttachmentBlob> {
    const blob: AttachmentBlob = {
      id: file.id,
      organizationId,
      blob: file.data,
      size: file.size || file.data.size,
      contentType: file.type || 'application/octet-stream',
      source: 'upload',
      syncStatus,
      syncAttempts: 0,
      nextRetryAt: null,
      lastError: null,
      storedAt: new Date(),
    };

    await attachmentsDb.blobs.add(blob);
    return blob;
  }

  /**
   * Get pending uploads for sync.
   */
  async getPendingUploads(organizationId: string): Promise<AttachmentBlob[]> {
    return attachmentsDb.blobs
      .where('[organizationId+syncStatus]')
      .equals([organizationId, 'pending'])
      .toArray();
  }

  /**
   * Update sync status.
   */
  async updateSyncStatus(
    id: string,
    status: AttachmentBlob['syncStatus'],
    error?: string
  ): Promise<void> {
    const updates: Partial<AttachmentBlob> = { syncStatus: status };
    
    if (status === 'failed') {
      const blob = await attachmentsDb.blobs.get(id);
      if (blob) {
        updates.syncAttempts = blob.syncAttempts + 1;
        updates.lastError = error || null;
        // Exponential backoff: 1min, 5min, 15min
        const delays = [60000, 300000, 900000];
        const delay = delays[Math.min(blob.syncAttempts, delays.length - 1)];
        updates.nextRetryAt = new Date(Date.now() + delay);
      }
    }
    
    await attachmentsDb.blobs.update(id, updates);
  }

  /**
   * Get blob for rendering.
   */
  async getBlob(id: string): Promise<Blob | null> {
    const record = await attachmentsDb.blobs.get(id);
    return record?.blob ?? null;
  }

  /**
   * Get blob URL for rendering.
   */
  async getBlobUrl(id: string): Promise<string | null> {
    const blob = await this.getBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  }
}

export const uploadStorage = new UploadStorage();
```

### 3.2 Update uploader helpers

**File:** `frontend/src/modules/common/uploader/helpers/index.ts`

**Changes:**
1. Detect cloud availability before configuring Transloadit
2. Store blobs locally regardless of cloud status
3. Only add Transloadit plugin when cloud available
4. Emit `local:stored` event for immediate UI update

```typescript
export const createBaseTransloaditUppy = async (
  uppyOptions: CustomUppyOpt,
  tokenQuery: UploadTokenQuery,
): Promise<CustomUppy> => {
  // Determine cloud availability early
  let cloudToken: UploadToken | null = null;
  try {
    if (onlineManager.isOnline()) {
      cloudToken = await getUploadToken({ query: tokenQuery });
    }
  } catch {
    cloudToken = null;
  }

  const hasCloudUpload = cloudToken?.params && cloudToken?.signature;

  const uppy = new Uppy({
    ...uppyOptions,
    meta: {
      public: tokenQuery.public,
      bucketName: tokenQuery.public ? appConfig.s3PublicBucket : appConfig.s3PrivateBucket,
      offlineUploaded: !hasCloudUpload,
    },
    onBeforeFileAdded,
    onBeforeUpload: async (files) => {
      // Clean file names
      for (const file of Object.values(files)) {
        const cleanName = cleanFileName(file.name || 'file');
        file.name = cleanName;
        file.meta.name = cleanName;
      }

      // ALWAYS store locally first
      const organizationId = tokenQuery.organizationId!;
      const syncStatus = hasCloudUpload ? 'pending' : 'local-only';
      
      for (const file of Object.values(files)) {
        await uploadStorage.storeBlob(file, organizationId, syncStatus);
      }

      // If no cloud, emit local completion and stop
      if (!hasCloudUpload) {
        const assembly = await prepareFilesForOffline(files, tokenQuery);
        uppy.emit('transloadit:complete', assembly);
        return false; // Don't proceed with upload
      }

      return true; // Proceed with Transloadit upload
    },
  });

  // Only add Transloadit plugin if cloud is available
  if (hasCloudUpload) {
    uppy.use(Transloadit, {
      waitForEncoding: true,
      alwaysRunAssembly: true,
      assemblyOptions: { params: cloudToken.params, signature: cloudToken.signature },
    });

    // On successful cloud upload, mark local blobs as synced
    uppy.on('transloadit:complete', async (assembly) => {
      if (assembly.ok === 'ASSEMBLY_COMPLETED' && !assembly.assembly_id.startsWith('offline_')) {
        for (const upload of assembly.uploads || []) {
          await uploadStorage.updateSyncStatus(upload.original_id, 'synced');
        }
      }
    });
  }

  return uppy;
};
```

### 3.3 Add Golden Retriever plugin

**File:** `frontend/package.json`

**Add dependency:**
```json
"@uppy/golden-retriever": "^4.x.x"
```

**Usage in uploader:**
```typescript
import GoldenRetriever from '@uppy/golden-retriever';

// In createBaseTransloaditUppy
uppy.use(GoldenRetriever, {
  serviceWorker: false, // Use IndexedDB only
});
```

---

## Phase 4: Download service

### 4.1 Create download service

**File:** `frontend/src/modules/attachment/offline/download-service.ts` (new)

**Purpose:** Background fetch attachments from react-query cache for offline viewing

Uses `appConfig.localBlobStorage` for configuration:

```typescript
// config/default.ts
localBlobStorage: {
  enabled: true,
  maxFileSize: 10 * 1024 * 1024,        // 10MB
  maxTotalSize: 100 * 1024 * 1024,      // 100MB
  allowedContentTypes: [],               // Empty = all
  excludedContentTypes: ['video/*'],     // Skip videos
  downloadConcurrency: 2,
  uploadRetryAttempts: 3,
  uploadRetryDelays: [60000, 300000, 900000],
}
```

```typescript
import { appConfig } from 'config';

/**
 * Download service uses appConfig.localBlobStorage for configuration.
 */
class AttachmentDownloadService {
  private get config() {
    return appConfig.localBlobStorage;
  }
  
  private processing = false;
  private activeDownloads = 0;

  /** Update configuration */
  setConfig(config: Partial<OfflineCacheConfig>): void;

  /**
   * Scan react-query cache and queue attachments for download.
   */
  async syncFromQueryCache(organizationId: string): Promise<void>;

  /**
   * Queue attachments for download, applying filters.
   */
  async queueAttachments(attachments: Attachment[]): Promise<void>;

  /**
   * Process the download queue.
   */
  async processQueue(): Promise<void>;

  /**
   * Get blob for an attachment.
   */
  async getBlob(attachmentId: string): Promise<Blob | null>;

  /**
   * Get blob URL for an attachment.
   */
  async getBlobUrl(attachmentId: string): Promise<string | null>;

  /**
   * Check if attachment is cached locally.
   */
  async isCached(attachmentId: string): Promise<boolean>;

  /**
   * Get cache statistics.
   */
  async getStats(organizationId?: string): Promise<CacheStats>;

  /**
   * Clear all cached downloads for an organization.
   */
  async clearCache(organizationId: string): Promise<void>;
}

export const attachmentDownloadService = new AttachmentDownloadService();
```

### 4.2 Integrate with query.ts

**File:** `frontend/src/modules/attachment/query.ts`

**Changes:**

```typescript
export const attachmentsQueryOptions = (params: AttachmentsListParams) => {
  // ... existing code ...

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const result = await getAttachments({ ... });
      
      // Queue new attachments for offline caching
      if (result.data) {
        attachmentDownloadService.queueAttachments(result.data);
      }
      
      return result;
    },
    ...baseInfiniteQueryOptions,
  });
};
```

---

## Phase 5: Upload sync worker

### 5.1 Create upload sync worker

**File:** `frontend/src/modules/attachment/offline/upload-sync-worker.ts` (new)

**Purpose:** Sync pending uploads when online + cloud available

```typescript
/**
 * Background worker that syncs pending uploads to cloud.
 */
class UploadSyncWorker {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Start the sync worker */
  start(): void {
    window.addEventListener('online', () => this.attemptSync());
    this.intervalId = setInterval(() => this.attemptSync(), 60000);
    this.attemptSync();
  }

  /** Stop the sync worker */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Attempt to sync pending uploads */
  async attemptSync(): Promise<void> {
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;

    this.processing = true;
    try {
      // Get all pending blobs
      const pending = await attachmentsDb.blobs
        .where('syncStatus')
        .equals('pending')
        .toArray();

      for (const blob of pending) {
        await this.syncBlob(blob);
      }
    } finally {
      this.processing = false;
    }
  }

  /** Sync a single blob to cloud */
  private async syncBlob(blob: AttachmentBlob): Promise<void> {
    try {
      // Get fresh upload token
      const token = await getUploadToken({
        query: {
          public: false, // TODO: get from attachment metadata
          templateId: 'attachment',
          organizationId: blob.organizationId,
        },
      });

      if (!token?.params) {
        // Cloud not available, mark as local-only
        await uploadStorage.updateSyncStatus(blob.id, 'local-only');
        return;
      }

      // Upload via Transloadit
      await uploadStorage.updateSyncStatus(blob.id, 'syncing');
      
      // ... upload logic using fetch/FormData to Transloadit
      
      await uploadStorage.updateSyncStatus(blob.id, 'synced');
      
    } catch (error) {
      await uploadStorage.updateSyncStatus(
        blob.id,
        'failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

export const uploadSyncWorker = new UploadSyncWorker();
```

### 5.2 Initialize in provider

**File:** `frontend/src/query/provider.tsx`

```typescript
import { uploadSyncWorker } from '~/modules/attachment/offline/upload-sync-worker';

// In provider component
useEffect(() => {
  uploadSyncWorker.start();
  return () => uploadSyncWorker.stop();
}, []);
```

---

## Phase 6: URL resolution

### 6.1 Create URL resolver hook

**File:** `frontend/src/modules/attachment/hooks/use-attachment-url.ts` (new)

```typescript
/**
 * Hook to resolve attachment URL, preferring local blob.
 * Handles blob URL cleanup on unmount.
 */
export const useAttachmentUrl = (attachment: Attachment) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;

    const resolve = async () => {
      setIsLoading(true);

      // Try local first (both uploads and downloads)
      const localBlob = await attachmentsDb.blobs.get(attachment.id);
      
      if (!cancelled && localBlob?.blob) {
        blobUrl = URL.createObjectURL(localBlob.blob);
        setUrl(blobUrl);
        setIsLocal(true);
        setIsLoading(false);
        return;
      }

      // Fall back to cloud URL
      if (!cancelled && attachment.originalKey) {
        try {
          const cloudUrl = await getPresignedUrl({
            query: { key: attachment.originalKey, isPublic: attachment.public },
          });
          if (!cancelled) {
            setUrl(cloudUrl);
            setIsLocal(false);
          }
        } catch {
          // Offline or error - no URL available
        }
      }
      
      if (!cancelled) {
        setIsLoading(false);
      }
    };

    resolve();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [attachment.id, attachment.originalKey, attachment.public]);

  return { url, isLocal, isLoading };
};
```

### 6.2 Update render components

**File:** `frontend/src/modules/attachment/render/index.tsx`

```typescript
export const AttachmentRender = ({
  id,
  url: propUrl,
  type,
  altName,
  // ... other props
}: AttachmentRenderProps) => {
  // Use hook to resolve URL (prefers local)
  const { url, isLocal, isLoading } = useAttachmentUrl({ id, originalKey: propUrl, ... });

  if (isLoading || !url) {
    return <Spinner className="h-12 w-12 mt-[45vh]" />;
  }

  // Optionally show offline indicator
  // {isLocal && <CloudOffIcon className="absolute top-2 right-2" />}

  return (
    <div className={containerClassName}>
      {/* ... existing render logic using `url` instead of `propUrl` */}
    </div>
  );
};
```

### 6.3 Update carousel component

**File:** `frontend/src/modules/attachment/carousel.tsx`

The carousel receives `CarouselItemData[]` with URLs. Update to resolve each item's URL:

```typescript
// Option A: Resolve URLs at carousel level
function AttachmentsCarousel({ items, ... }: CarouselProps) {
  // Each CarouselItem uses useAttachmentUrl internally
  return (
    <BaseCarousel>
      <CarouselContent>
        {items.map((item) => (
          <CarouselItem key={item.id}>
            <AttachmentRender
              id={item.id}
              url={item.url}  // Hook resolves this internally
              type={item.contentType || ''}
              altName={item.name}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </BaseCarousel>
  );
}
```

### 6.4 Update attachment dialog

**File:** `frontend/src/modules/attachment/dialog/index.tsx`

The dialog receives attachments and passes them to carousel. No changes needed if carousel handles URL resolution internally.

```typescript
function AttachmentDialog({ attachmentId, attachments }: AttachmentDialogProps) {
  // attachments already contain metadata from react-query cache
  // URL resolution happens in AttachmentRender via useAttachmentUrl hook
  
  return (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  );
}
```

---

## Phase 7: Helpers update

### 7.1 Update attachment helpers

**File:** `frontend/src/modules/attachment/helpers.ts`

**Add:**

```typescript
/**
 * Create an Attachment object from a locally stored blob.
 * Used for optimistic UI updates when uploading.
 */
export const createAttachmentFromLocalBlob = (
  blob: AttachmentBlob,
  userId: string,
): Attachment => {
  const extIndex = blob.filename?.lastIndexOf('.') ?? -1;
  const name = extIndex > 0 ? blob.filename!.substring(0, extIndex) : blob.filename || 'file';

  return {
    id: blob.id,
    entityType: 'attachment',
    organizationId: blob.organizationId,
    groupId: null,
    filename: blob.filename || 'file',
    name,
    description: '',
    keywords: '',
    size: String(blob.size),
    contentType: blob.contentType,
    public: false,
    originalKey: blob.syncStatus === 'synced' ? blob.cloudUrl : null,
    convertedKey: null,
    convertedContentType: null,
    thumbnailKey: null,
    bucketName: null,
    createdAt: blob.storedAt.toISOString(),
    createdBy: userId,
    modifiedAt: null,
    modifiedBy: null,
    tx: { id: '', sourceId: '', version: 0, fieldVersions: {} },
  };
};
```

---

## File summary

| File | Action | Purpose |
|------|--------|---------|
| `attachment/dexie/attachments-db.ts` | Modify | New schema with `blobs` + `downloadQueue` |
| `attachment/dexie/upload-storage.ts` | Create | Local blob storage operations |
| `attachment/offline/download-service.ts` | Create | Background download manager |
| `attachment/offline/upload-sync-worker.ts` | Create | Background upload sync |
| `attachment/hooks/use-attachment-url.ts` | Create | URL resolution hook |
| `attachment/helpers.ts` | Modify | Add `createAttachmentFromLocalBlob` |
| `attachment/render/index.tsx` | Modify | Use URL hook |
| `attachment/carousel.tsx` | Modify | Use URL hook for items |
| `attachment/dialog/index.tsx` | Modify | Pass resolved URLs to carousel |
| `attachment/query.ts` | Modify | Trigger download queue after fetch |
| `common/uploader/helpers/index.ts` | Modify | Local-first flow, detect cloud |
| `backend/src/modules/me/me-handlers.ts` | Modify | Graceful null params |
| `query/provider.tsx` | Modify | Start sync worker |
| `package.json` | Modify | Add `@uppy/golden-retriever` |

---

## Estimated effort

| Phase | Files | Complexity | Est. time |
|-------|-------|------------|-----------|
| 1. Dexie schema | 1 | Medium | 1-2 hours |
| 2. Backend token | 1 | Low | 30 min |
| 3. Upload flow | 3 | High | 3-4 hours |
| 4. Download service | 2 | High | 3-4 hours |
| 5. Upload sync | 2 | Medium | 2-3 hours |
| 6. URL resolution | 4 | Medium | 2-3 hours |
| 7. Helpers | 1 | Low | 1 hour |

**Total: ~14-18 hours**

---

## Implementation order

1. **Phase 2** (Backend) - Quick win, unblocks testing
2. **Phase 1** (Dexie) - Foundation for everything else
3. **Phase 3** (Upload) - Core local-first functionality
4. **Phase 6** (URL resolution) - Make local files viewable
5. **Phase 5** (Upload sync) - Background cloud sync
6. **Phase 4** (Download) - Offline viewing of cloud files
7. **Phase 7** (Helpers) - Cleanup and polish

---

## Verification checklist

Before considering implementation complete, verify these scenarios work:

| Component | Scenario | Expected |
|-----------|----------|----------|
| `AttachmentDialog` | Open local-only attachment | Displays from IndexedDB blob |
| `AttachmentDialog` | Open synced attachment offline | Displays from cached blob |
| `AttachmentDialog` | Open cloud attachment online | Displays from presigned URL |
| `AttachmentsCarousel` | Navigate between mixed local/cloud | Each item resolves correctly |
| `AttachmentRender` | Render image from local blob | Image displays without network |
| `AttachmentRender` | Render PDF from local blob | PDF viewer works |
| Upload dialog | Upload without Transloadit | File stored locally, visible in table |
| Upload dialog | Upload offline | File queued, syncs when online |

---

## Testing scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| No Transloadit configured | Files stored locally, viewable, never upload |
| Offline upload | Files queued, sync when online |
| Online upload | Files stored locally + uploaded to cloud |
| Page refresh during upload | Golden Retriever restores, continues |
| Offline viewing | Cached files available without network |
| Large file filter | Videos skipped from download cache |
| Cache eviction | Oldest files removed when limit reached |
| Cloud becomes available | Pending uploads sync automatically |
| Upload fails | Retry with exponential backoff |
| Max retries exceeded | Mark as failed, keep local copy |
