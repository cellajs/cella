/**
 * Represents a single file's swizzle information.
 * A "swizzle" indicates that the file was modified, removed, renamed,
 * or replaced with a binary in the fork compared to the boilerplate.
 */
export interface SwizzleEntry {
  /** The relative path of the file in the repository */
  filePath: string;

  /** Whether the file has been swizzled */
  swizzled: boolean;

  /** The type of swizzle event that occurred */
  event: 'removed' | 'edited' | 'renamed' | 'binaryReplaced';

  /** Optional SHA of the last shared ancestor commit */
  sharedAncestorSha?: string;

  /** Optional commit SHA at the time of swizzle in the fork */
  lastCommitSha?: string;

  /** Optional blob SHA at the time of swizzle in the fork */
  blobSha?: string;

  /** Optional SHA of the fork commit immediately after the swizzle */
  commitAfterSwizzle?: string;

  /** ISO timestamp when the swizzle was last detected */
  lastSwizzledAt: string;

  /** Optional commit SHA of the boilerplate at swizzle time */
  boilerplateLastCommitSha?: string;

  /** Optional blob SHA of the boilerplate at swizzle time */
  boilerplateBlobSha?: string;
}

/**
 * Metadata containing the swizzle state for multiple files.
 */
export interface SwizzleMetadata {
  /** Schema version of the swizzle metadata */
  version: string;

  /** ISO timestamp of the last sync operation */
  lastSyncedAt: string;

  /** Map of file paths to their SwizzleEntry */
  entries: Record<string, SwizzleEntry>;
}

/**
 * Custom settings to detect swizzled files using glob patterns.
 */
export interface SwizzleSettings {
  /** Files to treat as "removed" based on patterns */
  removed?: string[];

  /** Files to treat as "edited" based on patterns */
  edited?: string[];
}

/**
 * Analysis of a file's swizzle state, comparing current state to metadata and settings.
 */
export interface SwizzleAnalysis {
  /** Existing metadata entry for the file, if available */
  existingMetadata?: SwizzleEntry;

  /** Whether the existing metadata still matches the current file state */
  existingMetadataValid?: boolean;

  /** Newly detected swizzle entry for this file, if triggered */
  newMetadata?: SwizzleEntry;

  /** Indicates if the file was flagged in custom settings as 'removed' or 'edited' */
  flaggedInSettingsAs?: 'removed' | 'edited' | undefined;
}