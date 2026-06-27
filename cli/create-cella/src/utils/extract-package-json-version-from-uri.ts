/**
 * Retrieves the version from the package.json file of a GitHub repository.
 * If the package.json file is not found or an error occurs, it returns 'unknown'.
 *
 * @param repositoryUrl {string} - The GitHub repository URL in the format 'github:user/repo'.
 * @param branch {string} - The branch name (defaults to 'main').
 * @returns {Promise<string>} - The version from the package.json file.
 */
export async function extractPackageJsonVersionFromUri(repositoryUrl: string, branch = 'main'): Promise<string> {
  // Extract owner and repo from the URL
  const [owner, repo] = repositoryUrl.replace('github:', '').split('/');

  // Use the GitHub contents API to fetch the package.json file for the given branch
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${branch}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.raw+json' },
    });
    if (!response.ok) return 'unknown';

    const packageJson = (await response.json()) as { version?: string };

    // Return the version from the package.json, or 'unknown' if not found
    return packageJson.version || 'unknown';
  } catch {
    // If there's an error (file not found, etc.), return 'unknown'
    return 'unknown';
  }
}
