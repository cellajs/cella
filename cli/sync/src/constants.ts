// Import package.json dynamically for version and website information
import packageJson from '../package.json' assert { type: 'json' };

// Name of this CLI tool
export const NAME = 'cella sync';

// Divider string for console output
export const DIVIDER = '-------------------------------';

// package.json Description, Version, Author, Website, and GitHub Repository URL
export const DESCRIPTION: string = packageJson.description;
export const VERSION: string = packageJson.version;
export const AUTHOR: string = packageJson.author;
export const WEBSITE: string = packageJson.homepage;
export const GITHUB: string = packageJson.repository.url;