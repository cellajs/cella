export interface ZwizzleEntry {
  filePath: string;
  swizzled: boolean;
  event: 'removed' | 'edited' | 'renamed' | 'binaryReplaced';
  sharedAncestorSha?: string; // commit SHA where both had it last
  boilerplateBlobSha?: string; // blob at swizzle time
  forkBlobSha?: string;        // blob at swizzle time
  commitAfterSwizzle?: string; // fork commit immediately after swizzle
  detectedAt: string;          // ISO timestamp
}

export interface ZwizzleFile {
  version: string; // schema version
  entries: ZwizzleEntry[];
}