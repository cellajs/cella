import { zMembershipInviteBody } from 'sdk/zod.gen';
import { TagInput, type TagInputProps } from '~/modules/ui/tag-input';

interface SelectEmailsProps extends Omit<TagInputProps, 'tags' | 'setTags' | 'validateTag' | 'delimiter' | 'onChange'> {
  emails?: string[];
  onValueChange?: (emails: string[]) => void;
  /** Extract just the email from display name format */
  stripDisplayName?: boolean;
  allowDuplicate?: boolean;
  /** Custom regex delimiter for splitting pasted content. Defaults to /[,;\s]+/ */
  delimiter?: RegExp;
}

const defaultEmailDelimiter = /[,;\s]+/;

/** True for exactly the addresses an invite submit accepts, so every chip passes the form. */
export const isInviteEmail = (value: string) => zMembershipInviteBody.shape.emails.element.safeParse(value).success;

/** Extracts the address from "Name <email@domain.com>", or returns the value as-is. */
const extractEmail = (value: string, stripDisplayName: boolean): string => {
  if (!stripDisplayName) return value.trim();
  const match = value.match(/<([^>]+)>/);
  return match ? match[1].trim() : value.trim();
};

export function SelectEmails({
  emails,
  onValueChange,
  stripDisplayName = false,
  allowDuplicate = false,
  delimiter = defaultEmailDelimiter,
  ...tagInputProps
}: SelectEmailsProps) {
  const tags = emails ?? [];

  const validateEmail = (value: string): boolean => isInviteEmail(extractEmail(value, stripDisplayName));

  const handleSetTags: React.Dispatch<React.SetStateAction<string[]>> = (newTagsOrFn) => {
    const newTags = typeof newTagsOrFn === 'function' ? newTagsOrFn(tags) : newTagsOrFn;

    let processedTags = stripDisplayName ? newTags.map((tag) => extractEmail(tag, true)) : newTags;

    if (!allowDuplicate) {
      const seen = new Set<string>();
      processedTags = processedTags.filter((email) => {
        const lower = email.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    }

    onValueChange?.(processedTags);
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
}
