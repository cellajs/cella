# Dexie-based Attachment Storage

This module provides offline-first attachment storage using Dexie.js with enhanced capabilities.

## Architecture

### Database Schema

- **attachmentFiles**: Individual file records with metadata and sync status
- **attachmentBatches**: Groups of files uploaded together

### Key Features

- **Offline-first**: Files stored locally when offline
- **Auto-sync**: Automatic upload when connection restored
- **Batch management**: Groups files uploaded together
- **Live queries**: Reactive UI updates
- **Error handling**: Retry tracking and recovery

## Usage

### Storage Service

```typescript
import { dexieAttachmentStorage } from "~/modules/attachments/services/dexie-attachment-storage";

// Add files offline
const batchId = await dexieAttachmentStorage.addFiles(files, tokenQuery);

// Get files needing sync
const files = await dexieAttachmentStorage.getFilesBySyncStatus(orgId, "idle");

// Update sync status
await dexieAttachmentStorage.updateBatchSyncStatus(batchId, "processing");
```

### React Hooks

```typescript
import { useLocalAttachments, useLocalAttachmentsNeedingSync, useDexieLocalSync } from "~/modules/attachments/hooks";

// Get all local attachments
const { files, isLoading } = useLocalAttachments(orgId);

// Get files needing sync
const { files: pendingFiles, count } = useLocalAttachmentsNeedingSync(orgId);

// Enable auto-sync (use in attachment table component)
useDexieLocalSync(orgId);
```

## Sync Status Flow

1. **idle** - Files stored locally, ready to sync
2. **processing** - Currently uploading to server
3. **synced** - Successfully uploaded and cleaned up
4. **failed** - Upload failed, will retry on next sync
