import type { VariantProps } from 'class-variance-authority';
import React from 'react';

import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster';
import { Badge, type badgeVariants } from '~/modules/ui/badge';

enum Delimiter {
  Comma = ',',
}

type OmittedInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'size' | 'value'>;

interface TagInputStyleClassesProps {
  tagList?: string;
  tag?: { body?: string; closeButton?: string };
  input?: string;
  clearAllButton?: string;
}

interface TagInputProps extends OmittedInputProps {
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;

  direction?: 'row' | 'column';
  tagListPlacement: 'bottom' | 'top' | 'inside';

  placeholder?: string;
  placeholderWhenFull?: string;

  delimiter?: Delimiter;
  truncate?: number;
  minLength?: number;
  maxLength?: number;
  maxTags?: number;

  addOnPaste?: boolean;
  addTagsOnBlur?: boolean;
  showCount?: boolean;
  showClearAllButton?: boolean;

  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  badgeVariants?: Partial<VariantProps<typeof badgeVariants>>;
  styleClasses?: TagInputStyleClassesProps;

  onInputChange?: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onTagAdd?: (tag: string) => void;
  onTagRemove?: (tag: string) => void;
  onClearAll?: () => void;
  onTagClick?: (tag: string) => void;
  validateTag?: (tag: string) => boolean;
}

const TagInput = React.forwardRef<HTMLInputElement, TagInputProps>((props, ref) => {
  const {
    tags,
    setTags,

    direction = 'row',
    tagListPlacement,

    placeholder,
    placeholderWhenFull = 'Max tags reached',

    delimiter = Delimiter.Comma,
    truncate,
    minLength,
    maxLength,
    maxTags,

    addOnPaste = false,
    addTagsOnBlur = false,
    showCount = false,
    showClearAllButton = false,

    badgeVariants,
    inputProps = {},
    styleClasses = {},

    onInputChange,
    onFocus,
    onBlur,
    onTagAdd,
    onTagRemove,
    onClearAll,
    onTagClick,
    validateTag,
  } = props;

  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(null);
  const [inputValue, setInputValue] = React.useState('');
  const [tagCount, setTagCount] = React.useState(Math.max(0, tags.length));

  if (maxTags !== undefined && maxTags < 1) {
    console.warn('maxTags cannot be less than 1');
    return null;
  }

  const newTagValidation = (newTagText: string) => {
    if (validateTag && !validateTag(newTagText)) return 'Tag is not valid';

    if (minLength && newTagText.length < minLength) return 'Tag is too short';

    if (maxLength && newTagText.length > maxLength) return 'Tag is too long';

    if (maxTags && tags.length > maxTags) return 'Reached the maximum number of tags allowed';

    if (tags.some((oldTag) => oldTag === newTagText)) return `Duplicate tag "${newTagText}" not added`;

    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (addOnPaste && newValue.includes(delimiter)) {
      const splitValues = newValue
        .split(delimiter)
        .map((v) => v.trim())
        .filter((v) => v && v.length > 0); // Remove empty strings

      for (const newTag of splitValues) {
        const errorMessage = newTagValidation(newTag);
        if (errorMessage) return toaster(errorMessage, 'warning');

        setTags((prevTags) => [...prevTags, newTag]);
        onTagAdd?.(newTag);
      }

      setInputValue('');
    } else setInputValue(newValue);

    onInputChange?.(newValue);
  };

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    setActiveTagIndex(null); // Reset active tag index when the input field gains focus
    onFocus?.(event);
  };

  const handleInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (addTagsOnBlur && inputValue.trim()) {
      const newTag = inputValue.trim();

      const errorMessage = newTagValidation(newTag);
      if (errorMessage) return toaster(errorMessage, 'warning');

      setTags([...tags, newTag]);
      onTagAdd?.(newTag);
      setTagCount((prevTagCount) => prevTagCount + 1);
      setInputValue('');
    }

    onBlur?.(event);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === delimiter || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      const newTag = inputValue.trim();

      const errorMessage = newTagValidation(newTag);
      if (errorMessage) return toaster(errorMessage, 'warning');

      if (newTag) {
        setTags([...tags, newTag]);
        onTagAdd?.(newTag);
        setTagCount((prevTagCount) => prevTagCount + 1);
      }
      setInputValue('');
    } else {
      switch (e.key) {
        case 'Delete':
          if (activeTagIndex !== null) {
            e.preventDefault();
            const newTags = [...tags];
            newTags.splice(activeTagIndex, 1);
            setTags(newTags);

            setActiveTagIndex((prevIndex) => (prevIndex === null || prevIndex === 0 ? 0 : prevIndex - 1));
            setTagCount((prevTagCount) => prevTagCount - 1);
            onTagRemove?.(tags[activeTagIndex]);
          }
          break;
        case 'Backspace':
          if (activeTagIndex !== null) {
            e.preventDefault();
            const newTags = [...tags];
            newTags.splice(activeTagIndex, 1);
            setTags(newTags);

            setActiveTagIndex((prevIndex) => (prevIndex === null || prevIndex === 0 ? 0 : prevIndex - 1));
            setTagCount((prevTagCount) => prevTagCount - 1);
            onTagRemove?.(tags[activeTagIndex]);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          setActiveTagIndex((prevIndex) => {
            if (prevIndex === null) return 0;
            return prevIndex + 1 >= tags.length ? 0 : prevIndex + 1;
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setActiveTagIndex((prevIndex) => {
            if (prevIndex === null) return tags.length - 1;
            return prevIndex === 0 ? tags.length - 1 : prevIndex - 1;
          });
          break;
        case 'Home':
          e.preventDefault();
          setActiveTagIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveTagIndex(tags.length - 1);
          break;
        case 'Enter': {
          if (activeTagIndex && onTagClick) onTagClick(tags[activeTagIndex]);
          break;
        }
      }
    }
  };

  const removeTag = (TagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== TagToRemove));
    onTagRemove?.(tags.find((tag) => tag === TagToRemove) || '');
    setTagCount((prevTagCount) => prevTagCount - 1);
  };

  const handleClearAll = () => {
    setTags([]);
    setTagCount(0);
    setActiveTagIndex(null);

    onClearAll?.();
  };

  const truncatedTags = truncate ? tags.map((tag) => (tag.length > truncate ? `${tag.substring(0, truncate)}...` : tag)) : tags;

  return (
    <div className="w-full flex flex-col relative" ref={ref}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 p-2 w-full rounded-md text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium',
          tagListPlacement === 'bottom' ? 'flex-col-reverse' : tagListPlacement === 'top' ? 'flex-col' : 'flex-row',
          tagListPlacement === 'inside' &&
            'bg-background ring-offset-background border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground',
          tagListPlacement === 'inside' && styleClasses?.input,
        )}
      >
        <TagList
          tags={truncatedTags}
          badgeVariants={badgeVariants}
          onTagClick={onTagClick}
          onRemoveTag={removeTag}
          direction={direction}
          classStyleProps={{
            tagListClasses: cn(styleClasses?.tagList, tagListPlacement === 'inside' && tags.length < 1 && 'hidden'),
            tagClasses: styleClasses?.tag,
          }}
          activeTagIndex={activeTagIndex}
        />
        <Input
          ref={inputRef}
          type="text"
          placeholder={maxTags !== undefined && tags.length >= maxTags ? placeholderWhenFull : placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          {...inputProps}
          className={
            tagListPlacement !== 'inside'
              ? cn(
                  styleClasses?.input,
                  'bg-background ring-offset-background border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground',
                )
              : 'h-8 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 py-0 px-1'
          }
          disabled={maxTags !== undefined && tags.length >= maxTags}
        />
      </div>

      {showCount && (
        <Badge
          size="micro"
          className={`inline-flex items-center justify-center absolute -top-1 p-0 z-100 text-[10px]  ${maxTags ? '-right-2 w-5' : ' -right-1 w-4'}`}
        >
          {tagCount}
          {maxTags && `/${maxTags}`}
        </Badge>
      )}
      {showClearAllButton && (
        <Button type="button" onClick={handleClearAll} className={cn('flex items-center gap-1 mt-2', styleClasses?.clearAllButton)}>
          {t('common:clear_all')}
          <RefreshCw size={16} />
        </Button>
      )}
    </div>
  );
});

type TagListProps = Pick<TagInputProps, 'tags' | 'badgeVariants' | 'direction' | 'onTagClick'> & {
  activeTagIndex: null | number;
  classStyleProps: {
    tagListClasses: TagInputStyleClassesProps['tagList'];
    tagClasses: TagInputStyleClassesProps['tag'];
  };
  onRemoveTag: (id: string) => void;
};

const TagList: React.FC<TagListProps> = ({ tags, direction, classStyleProps, onTagClick, onRemoveTag, activeTagIndex, badgeVariants }) => {
  return (
    <div
      className={cn(
        'flex gap-1 w-full rounded-md',
        {
          'flex-row': direction === 'row',
          'flex-col': direction === 'column',
        },
        classStyleProps.tagListClasses,
      )}
    >
      {tags.map((tag, index) => (
        <Badge
          key={tag}
          {...badgeVariants}
          className={cn(
            { 'justify-between w-full': direction === 'column', 'ring-ring ring-offset-2 ring-2 ring-offset-background': index === activeTagIndex },
            classStyleProps.tagClasses?.body,
          )}
          onClick={() => onTagClick?.(tag)}
        >
          {tag}
          <Button
            variant="ghost"
            size="micro"
            onClick={(e) => {
              e.stopPropagation(); // Prevent event from bubbling up to the tag span
              onRemoveTag(tag);
            }}
            className={cn('p-0 h-full', classStyleProps.tagClasses?.closeButton)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-x"
            >
              <title className="hidden">Close Icon</title>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </Button>
        </Badge>
      ))}
    </div>
  );
};

export { TagInput };
