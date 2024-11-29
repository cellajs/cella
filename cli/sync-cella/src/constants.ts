// Application name
export const NAME: string = 'sync-cella';

// Import package.json dynamically for version and website information
import packageJson from '../package.json' assert { type: 'json' };

// Export version from package.json
export const VERSION: string = packageJson.version;

// URL to the Cella repository
export const CELLA_REMOTE_URL: string = 'git@github.com:cellajs/cella.git';

// Default Cella config file
export const DEFAULT_CONFIG_FILE: string = 'cella.config.js';

// Default diverged file
export const DEFAULT_DIVERGED_FILE: string = 'cella.diverged.txt';

// Default upstream branch
export const DEFAULT_UPSTREAM_BRANCH: string = 'development';

// ASCII art title for the application
export const CELLA_TITLE: string = `
                         _ _            
    ▒▓█████▓▒     ___ ___| | | __ _
    ▒▓█   █▓▒    / __/ _ \\ | |/ _\` |
    ▒▓█   █▓▒   | (_|  __/ | | (_| |
    ▒▓█████▓▒    \\___\\___|_|_|\\__,_|
`;
