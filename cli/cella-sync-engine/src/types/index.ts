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