import { MinimalSwizzleConfig } from "./types";

/**
 * Configuration related to swizzle metadata and settings files.
 */
export const swizzleDefaultConfig: MinimalSwizzleConfig = {
  /**
   * Local file system path to find metadata
   */
  localPath: process.cwd(),

  /**
   * Version of the swizzle metadata format (update when schema changes)
   */
  metadataVersion: '1.0.0',

  /**
   * Default metadata file name
   * Stores information about (auto detect) swizzled files
   */
  metadataFileName: 'cella-swizzle.metadata.json',

  /**
   * Stores user-defined flags of 'edited' files for swizzling 
   */
  editedFiles: [],

  /**
   * Stores user-defined flags of 'removed' files for swizzling
   */
  removedFiles: [],
};