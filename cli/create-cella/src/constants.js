export const NAME = 'create-cella'
export const TEMPLATE_URL = 'github:cellajs/cella';

// Files/folders to remove from the template
export const TO_REMOVE = [
    'info',
    './cli/create-cella'
];

// Folder contents to remove from the template
export const TO_CLEAN = [
    './backend/drizzle'
];

export const TO_COPY = {
    './backend/.env.example': './backend/.env',
    './tus/.env.example': './tus/.env',
};

export const CELLA_TITLE = `
                         _ _            
    ▒▓█████▓▒     ___ ___| | | __ _
    ▒▓█   █▓▒    / __/ _ \\ | |/ _\` |
    ▒▓█   █▓▒   | (_|  __/ | | (_| |
    ▒▓█████▓▒    \\___\\___|_|_|\\__,_|
`;