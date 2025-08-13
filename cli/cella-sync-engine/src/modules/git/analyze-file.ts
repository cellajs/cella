import pLimit from 'p-limit';

import { RepoConfig } from '../../config';
import { FileAnalysis, FileEntry } from '../../types';
import { analyzeFileCommits } from './analyze-file-commits';
import { analyzeFileBlob } from './analyze-file-blob';
import { analyzeFileMergeRisk } from './analyze-file-merge-risk';
import { checkFileAutomerge } from './check-file-merge';
import { detectZwizzles } from '../zwizzle/detect';

// Run 10 analyses at a time
const limit = pLimit(10);

export async function analyzeFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  boilerplateFile: FileEntry,
  forkFile?: FileEntry
): Promise<FileAnalysis> {
  const filePath = boilerplateFile.path;
  const commitSummary = await analyzeFileCommits(boilerplate, fork, filePath);
  const blobStatus = analyzeFileBlob(boilerplateFile, forkFile);
  const mergeRisk = analyzeFileMergeRisk(commitSummary.status, blobStatus);

  // Before running checks, we also need to check if a file is "swizzled"
  // Should we do this in analyze? or in check?

  const analyzedFile = {
    filePath,
    boilerplateFile,
    forkFile,
    commitSummary,
    blobStatus,
    mergeRisk
  } as FileAnalysis;

  // @TODO: enable zwizzle detection
  // detectZwizzles(analyzedFile);

  await checkFile(boilerplate, fork, analyzedFile);

  return analyzedFile;
}

export async function checkFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  analyzedFile: FileAnalysis
): Promise<void> {
  // Destructure necessary properties
  const { filePath, mergeRisk } = analyzedFile;

  if (mergeRisk?.check === 'gitAutoMerge') {
    //@TODO: Only run check where necessary, POC for now is package.json
    if (filePath === 'package.json') {
      analyzedFile.mergeCheck = await checkFileAutomerge(boilerplate, fork, analyzedFile);
    }
  }
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