import validate from 'validate-npm-package-name';

interface ValidationResult {
  valid: boolean;
  problems?: string[];
}

export function validateProjectName(name: string): ValidationResult {
  const nameValidation = validate(name);

  if (nameValidation.validForNewPackages) {
    return { valid: true };
  }

  return {
    valid: false,
    problems: [
      ...(nameValidation.errors || []),
      ...(nameValidation.warnings || []),
    ],
  };
}
