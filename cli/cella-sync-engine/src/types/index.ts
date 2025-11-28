import { CommitSummary, FileEntry, FileMergeStrategy } from './git';
import { SwizzleAnalysis } from './swizzle';

export * from './git';
export * from './swizzle';

/**
 * Represents the analysis of a single file when comparing a fork with its boilerplate.
 */
export type FileAnalysis = {
  /** The relative path of the file in the repository */
  filePath: string;

  /** The file entry from the boilerplate */
  boilerplateFile: FileEntry;

  /** The file entry from the fork, if it exists */
  forkFile?: FileEntry;

  /** Optional summary of commits comparing the fork and boilerplate */
  commitSummary?: CommitSummary;

  /** Status of the file's blob comparison */
  blobStatus?: 'identical' | 'different' | 'missing';

  /** Optional analysis result from swizzle operations */
  swizzle?: SwizzleAnalysis;

  /** Recommended merge strategy for this file, if available */
  mergeStrategy?: FileMergeStrategy;
}

/**
 * Represents a simplified structure of a package.json file.
 */
export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any; // optional, allows other fields
}
