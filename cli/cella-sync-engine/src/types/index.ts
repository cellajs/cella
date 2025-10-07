import { CommitSummary, FileEntry, FileMergeStrategy, MergeResult } from './git';
import { SwizzleAnalysis } from './swizzle';

export * from './git';
export * from './swizzle';

export type FileAnalysis = {
  filePath: string;
  boilerplateFile: FileEntry;
  forkFile?: FileEntry;
  commitSummary?: CommitSummary;
  blobStatus?: 'identical' | 'different' | 'missing';
  swizzle?: SwizzleAnalysis;
  mergeStrategy?: FileMergeStrategy;
}

export interface MergeResult {
  status: 'success' | 'conflict' | 'error';
  error?: Error;
  isMerging?: boolean; // Indicates whether a merge is still in progress (e.g., conflicts unresolved)
}