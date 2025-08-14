import pc from "picocolors";
import { FileAnalysis } from "../types";
import { logConfig } from "../config";

/**
 * Generates a formatted log line for Zwizzle analysis of a file.
 * Includes key details: file path, swizzle event, commit info, and detection status.
 */
export function analyzedZwizzleLine(analyzedFile: FileAnalysis): string {
  const filePath = getFilePath(analyzedFile);
  const status = getZwizzleStatus(analyzedFile);
  const zwizzleEvent = getZwizzleEvent(analyzedFile);
  const lastZwizzledAt = getLastZwizzledAt(analyzedFile);
  const statusTag = getZwizzleStatusTag(analyzedFile);

  const parts: string[] = [
    filePath,
    status,
    zwizzleEvent,
    lastZwizzledAt,
    statusTag
  ].filter(Boolean);

  return parts.join(' ').trim();
}

export function logAnalyzedZwizzleLine(analyzedFile: FileAnalysis, line: string): void {
  const logModulesConfigured = 'modules' in logConfig;
  const zwizzledConfigured = 'zwizzled' in logConfig.analyzedZwizzle;

  const includesModule = logConfig.modules?.includes('analyzedZwizzle');
  const zwizzledEqual = logConfig.analyzedZwizzle.zwizzled === (analyzedFile.zwizzle?.existingMetadata?.zwizzled || analyzedFile.zwizzle?.newMetadata?.zwizzled);

  const shouldLog = [
    !logModulesConfigured || includesModule,
    !zwizzledConfigured || zwizzledEqual,
  ].every(Boolean);
  
  if (shouldLog) console.log(line);
}

function getFilePath(analyzedFile: FileAnalysis): string {
  const filePath = analyzedFile.filePath;
  return pc.white(filePath);
}

function getZwizzleStatus(analyzedFile: FileAnalysis): string {
  const zwizzle = analyzedFile.zwizzle;

  if (!zwizzle?.existingMetadata?.zwizzled && !zwizzle?.newMetadata?.zwizzled) {
    return pc.dim(`Not zwizzled`);
  }

  return pc.bold(pc.cyan('Zwizzled'));
}

function getZwizzleEvent(analyzedFile: FileAnalysis): string {
  const zwizzle = analyzedFile.zwizzle;
  const metadata = zwizzle?.existingMetadata || zwizzle?.newMetadata;

  if (metadata?.zwizzled) {
    return `(${metadata.event})`
  }

  return '';
}

function getLastZwizzledAt(analyzedFile: FileAnalysis): string {
  const zwizzle = analyzedFile.zwizzle;
  const metadata = zwizzle?.existingMetadata || zwizzle?.newMetadata;

  if (metadata?.zwizzled) {
    const date = new Date(metadata.lastZwizzledAt);
    return pc.dim(`at ${date.toLocaleDateString()}`);
  }

  return '';
}

function getZwizzleStatusTag(analyzedFile: FileAnalysis): string {
  const zwizzle = analyzedFile.zwizzle;

  if (zwizzle?.existingMetadata?.zwizzled) {
    if (zwizzle.existingMetadataValid) {
      return pc.bgGreen(pc.black(' Valid '));
    }

    return pc.bgRed(pc.black(' Invalid '));
  }

  if (zwizzle?.newMetadata?.zwizzled) {
    return pc.bgYellow(pc.black(' New '));
  }

  return '';
}