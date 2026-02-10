import { TagInput, type TagInputProps } from '~/modules/ui/tag-input';
import { isEmail } from '~/utils/is-email';

export interface SelectEmailsProps
  extends Omit<TagInputProps, 'tags' | 'setTags' | 'validateTag' | 'delimiter' | 'onChange'> {
  emails?: string[];
  onChange?: (emails: string[]) => void;
  /** Allow display name format like "Name <email@example.com>" */
  allowDisplayName?: boolean;
  /** Extract just the email from display name format */
  stripDisplayName?: boolean;
  /** Allow duplicate emails */
  allowDuplicate?: boolean;
  /** Custom regex delimiter for splitting pasted content. Defaults to /[,;\s]+/ */
  delimiter?: RegExp;
}

/** Email delimiter regex: comma, semicolon, or whitespace */
const defaultEmailDelimiter = /[,;\s]+/;

/**
 * Extracts email from display name format "Name <email@domain.com>" or returns email as-is.
 */
const extractEmail = (value: string, stripDisplayName: boolean): string => {
  if (!stripDisplayName) return value.trim();
  const match = value.match(/<([^>]+)>/);
  return match ? match[1].trim() : value.trim();
};

/** Processes raw tags: extracts emails and filters duplicates */
const processTags = (tags: string[], stripDisplayName: boolean, allowDuplicate: boolean): string[] => {
  const processed = stripDisplayName ? tags.map((tag) => extractEmail(tag, true)) : tags;

  if (allowDuplicate) return processed;

  const seen = new Set<string>();
  return processed.filter((email) => {
    const lower = email.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
};

/**
 * Controlled email input component with multi-email support, validation, and paste handling.
 * Built on top of TagInput with email-specific validation and delimiter support.
 * State is fully owned by the parent via emails/onChange — no internal state duplication.
 */
export const SelectEmails = ({
  emails = [],
  onChange,
  allowDisplayName = false,
  stripDisplayName = false,
  allowDuplicate = false,
  delimiter = defaultEmailDelimiter,
  ...tagInputProps
}: SelectEmailsProps) => {
  /** Validates email format, optionally allowing display name format */
  const validateEmail = (value: string): boolean => {
    const email = extractEmail(value, stripDisplayName);
    return isEmail(email, { allowDisplayName });
  };

  /** Translates TagInput's setTags dispatcher into processed onChange calls */
  const handleSetTags: React.Dispatch<React.SetStateAction<string[]>> = (newTagsOrFn) => {
    const newTags = typeof newTagsOrFn === 'function' ? newTagsOrFn(emails) : newTagsOrFn;
    onChange?.(processTags(newTags, stripDisplayName, allowDuplicate));
  };

  return (
    <TagInput
      tags={emails}
      setTags={handleSetTags}
      validateTag={validateEmail}
      delimiter={delimiter}
      addOnPaste
      addTagsOnBlur
      {...tagInputProps}
    />
  );
};
