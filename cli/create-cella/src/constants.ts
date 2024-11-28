export const NAME = 'create-cella';

// URL of the template repository
export const TEMPLATE_URL = 'github:cellajs/cella';

// URL to the Cella repository
export const CELLA_REMOTE_URL: string = 'git@github.com:cellajs/cella.git';

// Import package.json dynamically for version and website information
import packageJson from '../package.json' assert { type: 'json' };

// Export version, website, and author from package.json
export const VERSION: string = packageJson.version;
export const AUTHOR: string = packageJson.author;
export const WEBSITE: string = packageJson.homepage;

// Files or folders to be removed from the template after downloading
export const TO_REMOVE: string[] = [
  'info',
  './cli/create-cella',
];

// Specific folder contents to be cleaned out from the template
export const TO_CLEAN: string[] = [
  './backend/drizzle',
];

// Files to copy/paste after downloading
export const TO_COPY: Record<string, string> = {
  './backend/.env.example': './backend/.env',
  './frontend/.env.example': './frontend/.env',
  './tus/.env.example': './tus/.env',
  './info/QUICKSTART.md': 'README.md',
};

// ASCII title for the CLI output
export const CELLA_TITLE = `
                         _ _            
    ▒▓█████▓▒     ___ ___| | | __ _
    ▒▓█   █▓▒    / __/ _ \\ | |/ _\` |
    ▒▓█   █▓▒   | (_|  __/ | | (_| |
    ▒▓█████▓▒    \\___\\___|_|_|\\__,_|
`;
