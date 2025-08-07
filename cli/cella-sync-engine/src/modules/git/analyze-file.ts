import { RepoConfig } from '../../config';
import { FileAnalysis, FileEntry } from '../../types';
import { analyzeFileCommitHistory } from './analyze-file-commit-history';
import { analyzeFileBlob } from './analyze-file-blob';
import { analyzeFileConflict } from './analyze-file-conflict';

export async function analyzeFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  boilerplateFile: FileEntry,
  forkFile?: FileEntry
): Promise<FileAnalysis> {
  const filePath = boilerplateFile.path;
  const commitHistorySummary = await analyzeFileCommitHistory(boilerplate, fork, filePath);
  const blobStatus = analyzeFileBlob(boilerplateFile, forkFile);
  const conflict = analyzeFileConflict(commitHistorySummary.status, blobStatus);

  return {
    filePath,
    boilerplateFile,
    forkFile,
    commitHistorySummary,
    blobStatus,
    conflictLikelihood: conflict.likelihood,
    conflictReason: conflict.reason,
  };
}