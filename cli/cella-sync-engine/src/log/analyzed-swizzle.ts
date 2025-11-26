import pc from "picocolors";

import { FileAnalysis } from "../types";
import { config } from "../config";

/**
 * Generates a formatted log line for Swizzle analysis of a file.
 * Includes key details: file path, swizzle event, commit info, and detection status.
 * 
 * @param analyzedFile - The FileAnalysis object for the analyzed file.
 * 
 * @returns Formatted log line for the analyzed file.
 */
export function analyzedSwizzleLine(analyzedFile: FileAnalysis): string {

  // Gather various pieces of information about the analyzed swizzle (styled for console output)
  const filePath = getFilePath(analyzedFile);
  const status = getSwizzleStatus(analyzedFile);
  const swizzleEvent = getSwizzleEvent(analyzedFile);
  const lastSwizzledAt = getLastSwizzledAt(analyzedFile);
  const statusTag = getSwizzleStatusTag(analyzedFile);

  // Combine all parts into a single log line, just filtering out any empty strings
  const parts: string[] = [
    filePath,
    status,
    swizzleEvent,
    lastSwizzledAt,
    statusTag
  ].filter(Boolean);

  // Join parts with spaces and return the final log line
  return parts.join(' ').trim();
}

/**
 * Gets the file path of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled file path string.
 */
function getFilePath(analyzedFile: FileAnalysis): string {
  const filePath = analyzedFile.filePath;
  return pc.white(filePath);
}

/**
 * Gets the swizzle status of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled swizzle status string.
 */  
function getSwizzleStatus(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;

  if (!swizzle?.existingMetadata?.swizzled && !swizzle?.newMetadata?.swizzled) {
    return pc.dim(`Not swizzled`);
  }

  return pc.bold(pc.cyan('Swizzled'));
}

/**
 * Returns the swizzle event of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled swizzle event string.
 */
function getSwizzleEvent(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;
  const metadata = swizzle?.existingMetadata || swizzle?.newMetadata;

  if (metadata?.swizzled) {
    return `(${metadata.event})`
  }

  return '';
}

/**
 * Returns the last swizzled date of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled last swizzled date string.
 */
function getLastSwizzledAt(analyzedFile: FileAnalysis): string {
  const swizzle = analyzedFile.swizzle;
  const metadata = swizzle?.existingMetadata || swizzle?.newMetadata;

  if (metadata?.swizzled) {
    const date = new Date(metadata.lastSwizzledAt);
    return pc.dim(`at ${date.toLocaleDateString()}`);
  }

  return '';
}

/**
 * Returns a status tag indicating the swizzle validity of the analyzed file, styled for console output.
 * 
 * @param analyzedFile - The analyzed file object.
 * 
 * @returns The styled swizzle status tag string.
 */
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

/**
 * Checks if the analyzed swizzle module should be logged based on the configuration.
 * 
 * @returns Whether the analyzed swizzle module should be logged.
 */
export function shouldLogAnalyzedSwizzleModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;

  // If no specific modules are configured, log by default
  if (!logModulesConfigured) {
    return true;
  }

  return config.log.modules?.includes('analyzedSwizzle') || false;
}

/**
 * Will log the analyzed swizzle line based on the configuration.
 * 
 * @param analyzedFile - The analyzed file object.
 * @param line - The line to be logged.
 * 
 * @returns void
 */
export function logAnalyzedSwizzleLine(analyzedFile: FileAnalysis, line: string): void {
  // If swizzled (filter) is configured, check if it matches the analyzed file's swizzle status
  const swizzledConfigured = 'swizzled' in config.log.analyzedSwizzle;
  const swizzledEqual = config.log.analyzedSwizzle.swizzled === (analyzedFile.swizzle?.existingMetadata?.swizzled || analyzedFile.swizzle?.newMetadata?.swizzled);

  // Determine if the line should be logged based on all conditions
  const shouldLog = [
    shouldLogAnalyzedSwizzleModule(),
    !swizzledConfigured || swizzledEqual,
  ].every(Boolean);

  if (shouldLog) {
    console.info(line);
  }
}