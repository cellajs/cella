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
    const forks = (Array.isArray(config.forks) ? config.forks : []).filter(fork => fork.name && fork.remoteUrl && fork.branch);

    return { divergedFile, ignoreFile, ignoreList, upstreamBranch, forks };
  } catch (error) {
    return { problems: [`Error reading or parsing JSON file:: ${error}`] };
  }
}

// Function to extract paths using dynamic import for ES modules
async function extractUsingDynamicImport(configFile) {
  try {
    const { config } = await import(resolve(configFile));

    const divergedFile = config.divergedFile || null;
    const ignoreFile = config.ignoreFile || null;
    const ignoreList = Array.isArray(config.ignoreList) ? config.ignoreList : [];
    const upstreamBranch = config.upstreamBranch;
    const forks = (Array.isArray(config.forks) ? config.forks : []).filter(fork => fork.name && fork.remoteUrl && fork.branch);

    return { divergedFile, ignoreFile, ignoreList, upstreamBranch, forks };
  } catch (error) {
    return { problems: [`Error dynamically importing JS/TS file: ${error}
`] };
  }
}

// Main function to decide which extraction method to use
export async function extractValues(configFile) {
  const fileExt = extname(configFile).toLowerCase();

  if (fileExt === '.json') {
    return extractFromJson(configFile);
  } else if (fileExt === '.js') 
    return extractUsingDynamicImport(configFile);
  else if (fileExt === '.ts') {
    return extractUsingDynamicImport(configFile);
  } else {
    return { problems: [`Unsupported file format: ${fileExt}. Only .json, .ts, and .js are supported.`] };
  }
}