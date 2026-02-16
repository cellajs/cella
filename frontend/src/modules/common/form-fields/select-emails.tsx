import { useEffect, useState } from 'react';
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

/**
 * Email input component with multi-email support, validation, and paste handling.
 * Built on top of TagInput with email-specific validation and delimiter support.
 */
export const SelectEmails = ({
  emails,
  onChange,
  allowDisplayName = false,
  stripDisplayName = false,
  allowDuplicate = false,
  delimiter = defaultEmailDelimiter,
  ...tagInputProps
}: SelectEmailsProps) => {
  const [tags, setTags] = useState<string[]>(emails ?? []);

  // Sync external emails prop with internal state
  useEffect(() => {
    if (emails) setTags(emails);
  }, [emails]);

  /** Validates email format, optionally allowing display name format */
  const validateEmail = (value: string): boolean => {
    const email = extractEmail(value, stripDisplayName);
    return isEmail(email, { allowDisplayName });
  };

  /** Handles tag changes, applies email extraction and duplicate filtering */
  const handleSetTags: React.Dispatch<React.SetStateAction<string[]>> = (newTagsOrFn) => {
    setTags((prevTags) => {
      const newTags = typeof newTagsOrFn === 'function' ? newTagsOrFn(prevTags) : newTagsOrFn;

      // Process tags: extract emails if needed
      let processedTags = stripDisplayName ? newTags.map((tag) => extractEmail(tag, true)) : newTags;

      // Filter duplicates unless allowed
      if (!allowDuplicate) {
        const seen = new Set<string>();
        processedTags = processedTags.filter((email) => {
          const lower = email.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
      }

      onChange?.(processedTags);
      return processedTags;
    });
  };

  return (
    <TagInput
      tags={tags}
      setTags={handleSetTags}
      validateTag={validateEmail}
      delimiter={delimiter}
      addOnPaste
      addTagsOnBlur
      {...tagInputProps}
    />
  );
};
