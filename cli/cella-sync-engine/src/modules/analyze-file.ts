import pLimit from 'p-limit';

import { RepoConfig } from '../config';
import { FileAnalysis, FileEntry } from '../types';
import { analyzeFileCommits } from './git/analyze-file-commits';
import { analyzeFileBlob } from './git/analyze-file-blob';
import { analyzeFileMergeRisk } from './git/analyze-file-merge-risk';
import { checkFileAncestor, checkFileAutomerge, checkFileHead } from './git/check-file-merge';
import { analyzeZwizzle } from './zwizzle/analyze';

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

  // Create the initial analysis object
  const analyzedFile = {
    filePath,
    boilerplateFile,
    forkFile,
    commitSummary,
    blobStatus,
    mergeRisk
  } as FileAnalysis;

  // Extend the analysis with zwizzle data
  analyzedFile.zwizzle = analyzeZwizzle(analyzedFile);

  // Check the file and predict mergeability
  await checkFile(boilerplate, fork, analyzedFile);

  return analyzedFile;
}

/**
 * Checks the file for potential merge conflicts and predicts merge resolution
 * @param boilerplate - The boilerplate repository configuration.
 * @param fork - The fork repository configuration.
 * @param analyzedFile - The analyzed file information.
 */
export async function checkFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  analyzedFile: FileAnalysis
): Promise<void> {
  // Destructure necessary properties
  const { mergeRisk } = analyzedFile;

  if (mergeRisk?.check === 'gitAutoMerge') {
    analyzedFile.mergeCheck = await checkFileAutomerge(boilerplate, fork, analyzedFile);
  }





  if (mergeRisk?.check === 'verifyAncestor') { 
    analyzedFile.mergeCheck = await checkFileAncestor(boilerplate, fork, analyzedFile);
  }

  if (mergeRisk?.check === 'verifyHead') {
    analyzedFile.mergeCheck = await checkFileHead(boilerplate, fork, analyzedFile);
  }

  if (mergeRisk?.check === 'addedOrRemoved') {
    // Placeholder for future checks
  }

  if (mergeRisk?.check === 'threeWayMergeCheck') {
    // Placeholder for future checks
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