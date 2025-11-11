import { RepoConfig } from "../../types/config";

/**
 * Checklist item type definition.
 * @property prop - The property name to check
 * @property required - Whether the property is required
 * @property requiredIf - A function that determines if the property is required based on the config
 * @property allowedValues - An array of allowed values for the property
 */
type checklistItem = {
  prop: string;
  required?: boolean;
  requiredIf?: (config: RepoConfig) => boolean;
  allowedValues?: any[];
};

/**
 * Checks the repository configuration against a checklist.
 * @param repoConfig - The repository configuration
 * @param checklist - The checklist of properties to validate
 * @throws If any required property is missing or has an invalid value
 *
 * @example
 * checkConfig(boilerplateConfig, boilerplateConfigChecklist);
 */
export function checkConfig(repoConfig: RepoConfig, checklist: checklistItem[]) {
  for (const item of checklist) {
    const { prop, required, requiredIf, allowedValues } = item;

    // Check if property is required
    const isRequired = required || (requiredIf && requiredIf(repoConfig));

    if (isRequired && !(repoConfig as any)[prop]) {
      throw new Error(`Repository \`${prop}\` is not set.`);
    }

    // Check if property value is allowed
    if (allowedValues && (repoConfig as any)[prop] && !allowedValues.includes((repoConfig as any)[prop])) {
      throw new Error(`Repository \`${prop}\` has an invalid value: ${(repoConfig as any)[prop]}. Allowed values are: ${allowedValues.join(', ')}.`);
    }
  }
}