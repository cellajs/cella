/**
 * Configuration related to swizzle metadata and settings files.
 */
export const swizzleConfig = {
  /**
   * Version of the swizzle metadata format
   */
  metadataVersion: '1.0.0',

  /**
   * Default metadata file name
   * Stores information about swizzled files
   */
  metadataFileName: 'cella-swizzle.metadata.json',

  /**
   * Default settings file name
   * Stores user-defined settings for swizzling
   */
  settingsFileName: 'cella-swizzle.json',

  /**
   * Root directory for swizzle files
   * Can be overridden per run
   */
  rootDir: process.cwd(),

  /**
   * Computed path to the metadata file
   */
  get metadataFilePath() {
    return `${this.rootDir}/${this.metadataFileName}`;
  },

  /**
   * Computed path to the settings file
   */
  get settingsFilePath() {
    return `${this.rootDir}/${this.settingsFileName}`;
  }
};