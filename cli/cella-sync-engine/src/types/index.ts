import { CommitSummary, FileEntry, MergeCheck, MergeRisk } from './git';
import { ZwizzleAnalysis } from './zwizzle';

export * from './git';
export * from './zwizzle';

export type FileAnalysis = {
  filePath: string;
  boilerplateFile: FileEntry;
  forkFile?: FileEntry;
  commitSummary?: CommitSummary;
  blobStatus?: 'identical' | 'different' | 'missing';
  mergeRisk?: MergeRisk;
  mergeCheck?: MergeCheck;
  zwizzle?: ZwizzleAnalysis;
}

export interface MergeResult {
  status: 'success' | 'conflict' | 'error';
  error?: Error;
  isMerging?: boolean; // Indicates whether a merge is still in progress (e.g., conflicts unresolved)
}