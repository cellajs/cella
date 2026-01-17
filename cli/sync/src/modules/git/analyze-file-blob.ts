import { FileAnalysis, FileEntry } from '../../types';

/**
 * Determines the blob status of a file in the fork repository compared to the upstream.
 *
 * This function compares the SHA hashes (`blobSha`) of the provided upstream and fork
 * file entries to classify the file as either missing, identical, or different in the fork.
 *
 * @param upstreamFile - The file entry from the upstream repository.
 * @param forkFile - The file entry from the fork repository. If not provided, the file is considered missing.
 *
 * @returns A string indicating the file's blob status in the fork repository:
 * - `'missing'` — the file does not exist in the fork.
 * - `'identical'` — the file exists and its contents match the upstream.
 * - `'different'` — the file exists but its contents differ from the upstream.
 */
export function analyzeFileBlob(upstreamFile: FileEntry, forkFile?: FileEntry): FileAnalysis['blobStatus'] {
  if (!forkFile) {
    return 'missing';
  }

  if (upstreamFile.blobSha === forkFile.blobSha) {
    return 'identical';
  }

  return 'different';
}
