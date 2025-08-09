import { FileEntry, FileAnalysis } from "../../types";

export function analyzeFileBlob(
  boilerplateFile: FileEntry,
  forkFile?: FileEntry
): FileAnalysis["blobStatus"] {
  if (!forkFile) return 'missing';

  if (boilerplateFile.blobSha === forkFile.blobSha) {
    return 'identical';
  }

  // Further checks can be added here for content comparison if needed
  return 'different';
}