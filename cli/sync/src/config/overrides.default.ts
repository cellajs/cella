import { MinimalOverridesConfig } from './types';

/**
 * Configuration related to overrides metadata and settings files.
 */
export const overridesDefaultConfig: MinimalOverridesConfig = {
  /**
   * Local file system path (directory) to find metadata in
   */
  localDir: process.cwd(),

  /**
   * Version of the overrides metadata format (update when schema changes)
   */
  metadataVersion: '1.0.0',

  /**
   * Default metadata file name
   * Stores information about auto-detected overridden files
   */
  metadataFileName: 'cella.swizzled.json',

  /**
   * Files customized in fork; prefer fork version during merge conflicts
   */
  customized: [],

  /**
   * Files and directories to be fully ignored during sync
   */
  ignored: [],
};
