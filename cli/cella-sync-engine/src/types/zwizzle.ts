export interface ZwizzleEntry {
  filePath: string;
  zwizzled: boolean;
  event: 'removed' | 'edited' | 'renamed' | 'binaryReplaced';
  sharedAncestorSha?: string; // commit SHA where both had it last
  lastCommitSha?: string;        // commit at swizzle time
  blobSha?: string;        // blob at swizzle time
  commitAfterSwizzle?: string; // fork commit immediately after swizzle
  lastZwizzledAt: string;          // ISO timestamp
  boilerplateLastCommitSha?: string; // commit at swizzle time
  boilerplateBlobSha?: string; // blob at swizzle time
}

export interface ZwizzleMetadata {
  version: string; // schema version
  lastSyncedAt: string; // ISO timestamp of last sync
  entries: Record<string, ZwizzleEntry>; // filePath -> ZwizzleEntry
}

export interface ZwizzleAnalysis {
  existingMetadata?: ZwizzleEntry; // The entry from metadata (if any)
  existingMetadataValid?: boolean;    // Still matches current file state?
  newMetadata?: ZwizzleEntry;    // The newly detected entry (if triggered)
}