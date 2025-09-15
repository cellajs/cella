import { CommitSummary, FileEntry, FileMergeStrategy, MergeResult } from './git';
import { ZwizzleAnalysis } from './zwizzle';

export * from './git';
export * from './zwizzle';

export type FileAnalysis = {
  filePath: string;
  boilerplateFile: FileEntry;
  forkFile?: FileEntry;
  commitSummary?: CommitSummary;
  blobStatus?: 'identical' | 'different' | 'missing';
  zwizzle?: ZwizzleAnalysis;
  mergeStrategy?: FileMergeStrategy;
}

export interface MergeResult {
  status: 'success' | 'conflict' | 'error';
  error?: Error;
  isMerging?: boolean; // Indicates whether a merge is still in progress (e.g., conflicts unresolved)
}