import micromatch from 'micromatch';
import type { FileEntry } from './get-files-with-hashed';
import { type RepoConfig, ignoredFiles } from './config';
import { compareFileHistory, FileHistoryComparisonResult } from './compare-file-history';

type ResolutionStrategy = 'keepBoilerplate' | 'keepFork' | 'ignored' | undefined;

type FileExpectationType =
  | 'upToDate'
  | 'missing'
  | 'outdated'
  | 'diverged'
  | 'ahead'
  | 'behind'
  | 'unrelated';

export type FileExpectation = {
  type: FileExpectationType;
  canAutoResolve: boolean;
  expectingConflict: boolean;
  ignored: boolean;
  resolutionStrategy?: ResolutionStrategy;
};

export type FileAnalysis = {
  path: string;
  boilerplateFile: FileEntry;
  forkedFile?: FileEntry;
  comparison?: FileHistoryComparisonResult;
  expectation: FileExpectation;
};

export async function createFileAnalyses(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  boilerplateFiles: FileEntry[],
  forkFiles: FileEntry[]
): Promise<FileAnalysis[]> {
  const forkMap = new Map(forkFiles.map(file => [file.path, file]));
  const results: FileAnalysis[] = [];

  for (const boilerplateFile of boilerplateFiles) {
    const path = boilerplateFile.path;
    const forkedFile = forkMap.get(path);
    const ignored = isIgnored(path);

    if (!forkedFile) {
      results.push({
        path,
        boilerplateFile,
        expectation: createExpectation('missing', false, false, ignored),
      });
      continue;
    }

    const sameBlob = boilerplateFile.blobSha === forkedFile.blobSha;

    if (boilerplateFile.lastCommitSha === forkedFile.lastCommitSha) {
      results.push({
        path,
        boilerplateFile,
        forkedFile,
        expectation: createExpectation('upToDate', sameBlob, false, ignored),
      });
      continue;
    }

    const comparison = await compareFileHistory(boilerplateConfig, forkConfig, boilerplateFile);

    let status: FileExpectationType;
    let expectingConflict = false;

    switch (comparison.status) {
      case 'ahead':
      case 'behind':
        status = comparison.status;
        break;
      case 'unrelated':
      case 'diverged':
      default:
        status = comparison.status ?? 'outdated';
        expectingConflict = true;
        break;
    }

    results.push({
      path,
      boilerplateFile,
      forkedFile,
      comparison,
      expectation: createExpectation(status, sameBlob, expectingConflict, ignored),
    });
  }

  return results;
}

function createExpectation(
  type: FileExpectationType,
  canAutoResolve: boolean,
  expectingConflict: boolean,
  ignored: boolean
): FileExpectation {
  return {
    type,
    canAutoResolve,
    expectingConflict,
    ignored,
    resolutionStrategy: getResolutionStrategy(canAutoResolve, ignored),
  };
}

function getResolutionStrategy(canAutoResolve: boolean, ignored: boolean): ResolutionStrategy {
  if (ignored) return 'ignored';
  if (canAutoResolve) return 'keepBoilerplate';
  return undefined;
}

function isIgnored(path: string): boolean {
  return micromatch.isMatch(path, ignoredFiles);
}