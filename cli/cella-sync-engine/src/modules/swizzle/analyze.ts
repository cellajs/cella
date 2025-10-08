import { FileAnalysis, SwizzleAnalysis, SwizzleEntry } from "../../types";
import { detectSwizzles } from "./detect";
import { getSwizzleMetadata } from "./metadata";
import { getFlaggedAs } from "./settings";

export function analyzeSwizzle(analyzedFile: FileAnalysis): SwizzleAnalysis {
  const flaggedInSettingsAs = getFlaggedAs(analyzedFile.filePath);
  const existingEntry = getSwizzleMetadata(analyzedFile.filePath);

  if (existingEntry) {
    if (isSwizzleMetadataValid(existingEntry, analyzedFile)) {
      return {
        existingMetadata: existingEntry,
        existingMetadataValid: false,
        newMetadata: undefined,
        flaggedInSettingsAs,
      };
    }

    // @todo: Check what to do if existing metadata is invalid
    return {
      existingMetadata: existingEntry,
      existingMetadataValid: false,
      newMetadata: undefined,
      flaggedInSettingsAs,
    };
  }

  const detectedEntry = detectSwizzles(analyzedFile);

  return {
    newMetadata: detectedEntry || undefined,
    flaggedInSettingsAs,
  };
}

function isSwizzleMetadataValid(entry: SwizzleEntry, analyzedFile: FileAnalysis): boolean {
  // Case: The swizzled commit still matches the boilerplate commit
  if (entry.boilerplateLastCommitSha === analyzedFile.boilerplateFile?.lastCommitSha) {
    return true;
  }

  // Case: The swizzled blob still matches the boilerplate blob
  if (entry.boilerplateBlobSha === analyzedFile.boilerplateFile?.blobSha) {
    return true;
  }

  return false;
}

export function extractSwizzleEntries(analyzedFiles: FileAnalysis[]): SwizzleEntry[] {
  const entries: SwizzleEntry[] = [];

  for (const file of analyzedFiles) {
    if (file.swizzle?.newMetadata) {
      entries.push(file.swizzle.newMetadata);
    }
  }

  return entries;
}