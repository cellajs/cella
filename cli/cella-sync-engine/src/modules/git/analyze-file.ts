import pLimit from 'p-limit';

import { RepoConfig } from '../../config';
import { FileAnalysis, FileEntry } from '../../types';
import { analyzeFileCommits } from './analyze-file-commits';
import { analyzeFileBlob } from './analyze-file-blob';
import { analyzeFileMergeRisk } from './analyze-file-merge-risk';

// Run 10 analyses at a time
const limit = pLimit(10);

export async function analyzeFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  boilerplateFile: FileEntry,
  forkFile?: FileEntry
): Promise<FileAnalysis> {
  const filePath = boilerplateFile.path;
  const CommitSummary = await analyzeFileCommits(boilerplate, fork, filePath);
  const blobStatus = analyzeFileBlob(boilerplateFile, forkFile);
  const mergeRisk = analyzeFileMergeRisk(CommitSummary.status, blobStatus);

  return {
    filePath,
    boilerplateFile,
    forkFile,
    CommitSummary,
    blobStatus,
    mergeRisk
  };
}

export async function analyzeManyFiles(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  boilerplateFiles: FileEntry[],
  forkFiles: FileEntry[]
): Promise<FileAnalysis[]> {
  const forkMap = new Map(forkFiles.map(file => [file.path, file]));
  const analysisPromises = boilerplateFiles.map(boilerplateFile =>
    limit(async () => {
      const forkFile = forkMap.get(boilerplateFile.path);
      return analyzeFile(boilerplate, fork, boilerplateFile, forkFile);
    })
  );

  return Promise.all(analysisPromises);
}