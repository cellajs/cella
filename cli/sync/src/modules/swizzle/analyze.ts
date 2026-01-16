import { FileAnalysis, SwizzleAnalysis, SwizzleEntry } from "../../types";
import { detectSwizzles } from "./detect";
import { getSwizzleMetadata } from "./metadata";
import { getFlaggedAs } from "./settings";

/**
 * Run swizzle analysis on an analyzed file
 * 
 * @todo: Check what to do if existing metadata is invalid
 * 
 * @param analyzedFile The analyzed file data
 * 
 * @returns The swizzle analysis result
 */
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

/**
 * Check if existing swizzle metadata is still valid
 * 
 * @param entry - The existing swizzle entry
 * @param analyzedFile - The analyzed file data
 * 
 * @returns A boolean indicating if the existing metadata is valid
 */
function isSwizzleMetadataValid(entry: SwizzleEntry, analyzedFile: FileAnalysis): boolean {
  // Case: The swizzled commit still matches the upstream commit
  if (entry.upstreamLastCommitSha === analyzedFile.upstreamFile?.lastCommitSha) {
    return true;
  }

  // Case: The swizzled blob still matches the upstream blob
  if (entry.upstreamBlobSha === analyzedFile.upstreamFile?.blobSha) {
    return true;
  }

  return false;
}

/**
 * Retrieve all swizzle entries from an array of analyzed files
 * 
 * @param analyzedFiles - The array of analyzed file data
 * 
 * @returns An array of swizzle entries extracted from the analyzed files
 */
export function extractSwizzleEntries(analyzedFiles: FileAnalysis[]): SwizzleEntry[] {
  const entries: SwizzleEntry[] = [];

  for (const file of analyzedFiles) {
    if (file.swizzle?.newMetadata) {
      entries.push(file.swizzle.newMetadata);
    }
  }

  return entries;
}