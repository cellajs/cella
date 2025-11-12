// Import package.json dynamically for version and website information
import packageJson from '../package.json' assert { type: 'json' };

export const NAME = 'cella-sync-engine';

// Export details from package.json
export const DESCRIPTION: string = packageJson.description;
export const VERSION: string = packageJson.version;
export const AUTHOR: string = packageJson.author;
export const WEBSITE: string = packageJson.homepage;
export const GITHUB: string = packageJson.repository.url;