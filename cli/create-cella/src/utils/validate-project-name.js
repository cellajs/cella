import validate from 'validate-npm-package-name'

/**
 * Validates a project name according to npm package naming conventions.
 * 
 * @param {string} name - The name of the project to validate.
 * @returns {Object} - An object containing the validation result and any associated problems.
 * @returns {boolean} return.valid - Indicates if the project name is valid.
 * @returns {Array<string>} return.problems - A list of errors and warnings associated with the project name.
 */
export function validateProjectName(name) {
  // Validate the project name
  const nameValidation = validate(name);

  // If the name is valid for new packages, return valid status
  if (nameValidation.validForNewPackages) {
    return { valid: true, problems: [] };
  }

  // Return validation result with errors and warnings
  return {
    valid: false,
    problems: [
      ...(nameValidation.errors || []),
      ...(nameValidation.warnings || []),
    ],
  }
}