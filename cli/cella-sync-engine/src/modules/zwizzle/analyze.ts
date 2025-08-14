import { FileAnalysis, ZwizzleAnalysis, ZwizzleEntry } from "../../types";
import { detectZwizzles } from "./detect";
import { getZwizzleMetadata } from "./metadata";

export function analyzeZwizzle(analyzedFile: FileAnalysis): ZwizzleAnalysis {
  const existingEntry = getZwizzleMetadata(analyzedFile.filePath);

  if (existingEntry) {
    if (isZwizzleMetadataValid(existingEntry, analyzedFile)) {
      return {
        existingMetadata: existingEntry,
        existingMetadataValid: false,
        newMetadata: undefined
      };
    }

    // @todo: Check what to do if existing metadata is invalid
    return {
      existingMetadata: existingEntry,
      existingMetadataValid: false,
      newMetadata: undefined
    };
  }

  const detectedEntry = detectZwizzles(analyzedFile);

  return {
    newMetadata: detectedEntry || undefined
  };
}

function isZwizzleMetadataValid(entry: ZwizzleEntry, analyzedFile: FileAnalysis): boolean {
  // Case: The zwizzled commit still matches the boilerplate commit
  if (entry.boilerplateLastCommitSha === analyzedFile.boilerplateFile?.lastCommitSha) {
    return true;
  }

  // Case: The zwizzled blob still matches the boilerplate blob
  if (entry.boilerplateBlobSha === analyzedFile.boilerplateFile?.blobSha) {
    return true;
  }

  return false;
}