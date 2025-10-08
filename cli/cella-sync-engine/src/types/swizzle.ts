export interface SwizzleEntry {
  filePath: string;
  swizzled: boolean;
  event: 'removed' | 'edited' | 'renamed' | 'binaryReplaced';
  sharedAncestorSha?: string; // commit SHA where both had it last
  lastCommitSha?: string;        // commit at swizzle time
  blobSha?: string;        // blob at swizzle time
  commitAfterSwizzle?: string; // fork commit immediately after swizzle
  lastSwizzledAt: string;          // ISO timestamp
  boilerplateLastCommitSha?: string; // commit at swizzle time
  boilerplateBlobSha?: string; // blob at swizzle time
}

export interface SwizzleMetadata {
  version: string; // schema version
  lastSyncedAt: string; // ISO timestamp of last sync
  entries: Record<string, SwizzleEntry>; // filePath -> SwizzleEntry
}

export interface SwizzleSettings {
  removed?: string[]; // glob patterns of files to consider "removed"
  edited?: string[]; // glob patterns of files to consider "edited"
}

export interface SwizzleAnalysis {
  existingMetadata?: SwizzleEntry; // The entry from metadata (if any)
  existingMetadataValid?: boolean;    // Still matches current file state?
  newMetadata?: SwizzleEntry;    // The newly detected entry (if triggered)
  markedInSettingsAs?: 'removed' | 'edited' | undefined; // If custom config matched
}