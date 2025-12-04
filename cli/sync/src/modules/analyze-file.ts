import pLimit from 'p-limit';

import { RepoConfig } from '../config';
import { FileAnalysis, FileEntry } from '../types';
import { analyzeFileCommits } from './git/analyze-file-commits';
import { analyzeFileBlob } from './git/analyze-file-blob';
import { analyzeSwizzle } from './swizzle/analyze';
import { determineFileMergeStrategy } from './git/determine-file-merge-strategy';

// Run 10 analyses at a time
const limit = pLimit(10);

/**
 * Analyzes a file by comparing its state in the boilerplate and fork repositories.
 * 
 * @param boilerplate - The boilerplate repository configuration
 * @param fork - The fork repository configuration
 * @param boilerplateFile - The file entry from the boilerplate repository
 * @param forkFile - The file entry from the fork repository (if it exists)
 * 
 * @returns A promise that resolves to the analyzed file data
 */
export async function analyzeFile(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  boilerplateFile: FileEntry,
  forkFile?: FileEntry
): Promise<FileAnalysis> {
  const filePath = boilerplateFile.path;
  const commitSummary = await analyzeFileCommits(boilerplate, fork, filePath);
  const blobStatus = analyzeFileBlob(boilerplateFile, forkFile);

  // Create the initial analysis object
  const analyzedFile = {
    filePath,
    boilerplateFile,
    forkFile,
    commitSummary,
    blobStatus
  } as FileAnalysis;

  // Extend the analysis with swizzle data
  analyzedFile.swizzle = analyzeSwizzle(analyzedFile);

  // Extend the analysis with a merge strategy
  analyzedFile.mergeStrategy = determineFileMergeStrategy(analyzedFile);

  return analyzedFile;
}

/**
 * Analyzes multiple files by comparing their states in the boilerplate and fork repositories.
 * 
 * @param boilerplate - The boilerplate repository configuration
 * @param fork - The fork repository configuration
 * @param boilerplateFiles - The list of file entries from the boilerplate repository
 * @param forkFiles - The list of file entries from the fork repository
 * 
 * @returns A promise that resolves to an array of analyzed file data
 */
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