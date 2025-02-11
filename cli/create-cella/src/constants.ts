export const NAME = 'create-cella';

// URL of the template repository
export const TEMPLATE_URL = 'github:cellajs/cella';

// URL to the repository
export const CELLA_REMOTE_URL: string = 'git@github.com:cellajs/cella.git';

// Import package.json dynamically for version and website information
import packageJson from '../package.json' assert { type: 'json' };

// Export details from package.json
export const DESCRIPTION: string = packageJson.description;
export const VERSION: string = packageJson.version;
export const AUTHOR: string = packageJson.author;
export const WEBSITE: string = packageJson.homepage;
export const GITHUB: string = packageJson.repository.url;

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
  './backend/.env.example': './backend/src/.env',
  './frontend/.env.example': './frontend/src/.env',
  './tus/.env.example': './tus/src/.env',
  './info/QUICKSTART.md': 'README.md',
};

// Files to be editted after downloading
export const TO_EDIT: Record<string, { regexMatch: RegExp; replaceWith: string }[]> = {
  './config/default.ts': [
    {
      regexMatch: /enabledAuthenticationStrategies:\s*\[[^\]]+\]\s*as\s*const,/g,
      replaceWith: "enabledAuthenticationStrategies: ['password', 'passkey'] as const,",
    },
    {
      regexMatch: /imado\:\s*(true|false),/g,
      replaceWith: "imado: false,",
    },
    {
      regexMatch: /enabledOauthProviders:\s*\[[^\]]+\]\s*as\s*const,/g,
      replaceWith: "enabledOauthProviders: [] as const,",
    },
  ],
};
// ASCII logo for the CLI output
export const LOGO = `
                         _ _            
    ▒▓█████▓▒     ___ ___| | | __ _
    ▒▓█   █▓▒    / __/ _ \\ | |/ _\` |
    ▒▓█   █▓▒   | (_|  __/ | | (_| |
    ▒▓█████▓▒    \\___\\___|_|_|\\__,_|
`;
