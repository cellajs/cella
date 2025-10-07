import pc from "picocolors";
import { FileAnalysis } from "../types";
import { logConfig } from "../config";

/**
 * Generates a formatted log line for Swizzle analysis of a file.
 * Includes key details: file path, swizzle event, commit info, and detection status.
 */
export function analyzedSwizzleLine(analyzedFile: FileAnalysis): string {
  const filePath = getFilePath(analyzedFile);
  const status = getSwizzleStatus(analyzedFile);
  const swizzleEvent = getSwizzleEvent(analyzedFile);
  const lastSwizzledAt = getLastSwizzledAt(analyzedFile);
  const statusTag = getSwizzleStatusTag(analyzedFile);

  const parts: string[] = [
    filePath,
    status,
    swizzleEvent,
    lastSwizzledAt,
    statusTag
  ].filter(Boolean);

  return parts.join(' ').trim();
}

export function logAnalyzedSwizzleLine(analyzedFile: FileAnalysis, line: string): void {
  const logModulesConfigured = 'modules' in logConfig;
  const swizzledConfigured = 'swizzled' in logConfig.analyzedSwizzle;

  const includesModule = logConfig.modules?.includes('analyzedSwizzle');
  const swizzledEqual = logConfig.analyzedSwizzle.swizzled === (analyzedFile.swizzle?.existingMetadata?.swizzled || analyzedFile.swizzle?.newMetadata?.swizzled);

  const shouldLog = [
    !logModulesConfigured || includesModule,
    !swizzledConfigured || swizzledEqual,
  ].every(Boolean);
  
  if (shouldLog) console.log(line);
}

function getFilePath(analyzedFile: FileAnalysis): string {
  const filePath = analyzedFile.filePath;
  return pc.white(filePath);
}

function getSwizzleStatus(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;

  if (!swizzle?.existingMetadata?.swizzled && !swizzle?.newMetadata?.swizzled) {
    return pc.dim(`Not swizzled`);
  }

  return pc.bold(pc.cyan('Swizzled'));
}

function getSwizzleEvent(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;
  const metadata = swizzle?.existingMetadata || swizzle?.newMetadata;

  if (metadata?.swizzled) {
    return `(${metadata.event})`
  }

  return '';
}

function getLastSwizzledAt(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;
  const metadata = swizzle?.existingMetadata || swizzle?.newMetadata;

  if (metadata?.swizzled) {
    const date = new Date(metadata.lastSwizzledAt);
    return pc.dim(`at ${date.toLocaleDateString()}`);
  }

  return '';
}

function getSwizzleStatusTag(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;

  if (swizzle?.existingMetadata?.swizzled) {
    if (swizzle.existingMetadataValid) {
      return pc.bgGreen(pc.black(' Valid '));
    }

    return pc.bgRed(pc.black(' Invalid '));
  }

  if (swizzle?.newMetadata?.swizzled) {
    return pc.bgYellow(pc.black(' New '));
  }

  return '';
}