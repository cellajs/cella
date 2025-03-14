import axios from 'axios';

/**
 * Retrieves the version from the package.json file of a GitHub repository.
 * If the package.json file is not found or an error occurs, it returns 'unknown'.
 * 
 * @param repositoryUrl {string} - The GitHub repository URL in the format 'github:user/repo'.
 * @param branch {string} - The branch name (defaults to 'main').
 * @returns {Promise<string>} - The version from the package.json file.
 */
export async function extractPackageJsonVersionFromUri(repositoryUrl: string, branch: string = 'main'): Promise<string> {
  // Extract owner and repo from the URL
  const [owner, repo] = repositoryUrl.replace('github:', '').split('/');
  
  // Construct the URL for the package.json file in the provided branch
  const packageJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;

  try {
    // Fetch the package.json file
    const response = await axios.get(packageJsonUrl);
    const packageJson = response.data;
    
    // Return the version from the package.json, or 'unknown' if not found
    return packageJson.version || 'unknown';
  } catch (error) {
    // If there's an error (file not found, etc.), return 'unknown'
    return 'unknown';
  }
}