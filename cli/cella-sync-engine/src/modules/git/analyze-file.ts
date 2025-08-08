import { RepoConfig } from '../../config';
import { FileAnalysis, FileEntry } from '../../types';
import { analyzeFileCommitHistory } from './analyze-file-commit-history';
import { analyzeFileBlob } from './analyze-file-blob';
import { analyzeFileMergeRisk } from './analyze-file-merge-risk';

export async function analyzeFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  boilerplateFile: FileEntry,
  forkFile?: FileEntry
): Promise<FileAnalysis> {
  const filePath = boilerplateFile.path;
  const commitHistorySummary = await analyzeFileCommitHistory(boilerplate, fork, filePath);
  const blobStatus = analyzeFileBlob(boilerplateFile, forkFile);
  const mergeRisk = analyzeFileMergeRisk(commitHistorySummary.status, blobStatus);

  return {
    filePath,
    boilerplateFile,
    forkFile,
    commitHistorySummary,
    blobStatus,
    mergeRiskLikelihood: mergeRisk.likelihood,
    mergeRiskReason: mergeRisk.reason,
    mergeRiskSafeByGit: mergeRisk.safeByGit,
  };
}