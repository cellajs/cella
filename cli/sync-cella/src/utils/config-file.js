import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path'

// Function to extract paths from .json (simple key-value pairs)
async function extractFromJson(configFile) {
  try {
    const fileContent = await readFile(configFile, 'utf-8');
    const config = JSON.parse(fileContent);

    const divergedFile = config.diverged_file;
    const ignoreFile = config.ignore_file;
    const ignoreList = Array.isArray(config.ignore_list) ? config.ignore_list : [];
    const upstreamBranch = config.upstream_branch;

    return { divergedFile, ignoreFile, ignoreList, upstreamBranch };
  } catch (error) {
    return { problems: [`Error reading or parsing JSON file:: ${error}`] };
  }
}

// Function to extract paths from .ts or .js (without dynamic import for simplicity)
async function extractFromTs(configFile) {
  try {
    const fileContent = await readFile(configFile, 'utf-8');

    const divergedFile = fileContent.match(/divergedFile:\s*"([^"]+)"/)?.[1];
    const ignoreFile = fileContent.match(/ignoreFile:\s*"([^"]+)"/)?.[1];
    const ignoreListMatch = fileContent.match(/ignoreList:\s*\[([^\]]*)\]/);
    const ignoreList = ignoreListMatch
      ? ignoreListMatch[1].split(',').map(item => item.trim().replace(/['"]/g, ''))
      : [];
    const upstreamBranch = fileContent.match(/upstreamBranch:\s*"([^"]+)"/)?.[1];

    return { divergedFile, ignoreFile, ignoreList, upstreamBranch };
  } catch (error) {
    return { problems: [`Error reading or parsing TS file: ${error}`] };
  }
}

// Function to extract paths using dynamic import for ES modules
async function extractFromJsUsingDynamicImport(configFile) {
  try {
    const { config } = await import(resolve(configFile));

    const divergedFile = config.divergedFile || null;
    const ignoreFile = config.ignoreFile || null;
    const ignoreList = Array.isArray(config.ignoreList) ? config.ignoreList : [];
    const upstreamBranch = config.upstreamBranch;

    return { divergedFile, ignoreFile, ignoreList, upstreamBranch };
  } catch (error) {
    return { problems: [`Error dynamically importing JS file: ${error}
`] };
  }
}

// Main function to decide which extraction method to use
export async function extractValues(configFile) {
  const fileExt = extname(configFile).toLowerCase();

  if (fileExt === '.json') {
    return extractFromJson(configFile);
  } else if (fileExt === '.js') 
    return extractFromJsUsingDynamicImport(configFile);
  else if (fileExt === '.ts') {
    return extractFromTs(configFile);
  } else {
    return { problems: [`Unsupported file format: ${fileExt}. Only .json, .ts, and .js are supported.`] };
  }
}