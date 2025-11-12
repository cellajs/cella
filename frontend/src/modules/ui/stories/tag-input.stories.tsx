import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TagInput } from '~/modules/ui/tag-input';

/**
 * An advanced tag input component that allows users to add, remove, and manage tags with various customization options.
 */
const meta: Meta = {
  title: 'ui/TagInput',
  component: TagInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Default tag input with basic functionality.
 */
export const Default: Story = {
  render: () => {
    const [tags, setTags] = useState(['react', 'typescript', 'storybook']);
    return <TagInput tags={tags} setTags={setTags} placeholder="Add a tag..." showCount={true} tagListPlacement="bottom" />;
  },
};

/**
 * Tag input with maximum tag limit.
 */
export const WithMaxTags: Story = {
  render: () => {
    const [tags, setTags] = useState(['frontend', 'backend', 'database']);
    return <TagInput tags={tags} setTags={setTags} maxTags={5} showCount={true} placeholder="Add up to 5 tags..." tagListPlacement="bottom" />;
  },
};

/**
 * Tag input with character length validation.
 */
export const WithLengthValidation: Story = {
  render: () => {
    const [tags, setTags] = useState(['short', 'medium-length', 'very-long-tag-example']);
    return (
      <TagInput tags={tags} setTags={setTags} minLength={3} maxLength={20} placeholder="Tags must be 3-20 characters" tagListPlacement="bottom" />
    );
  },
};

/**
 * Tag input with clear all functionality.
 */
export const WithClearAll: Story = {
  render: () => {
    const [tags, setTags] = useState(['important', 'urgent', 'review', 'pending']);
    return <TagInput tags={tags} setTags={setTags} showClearAllButton={true} placeholder="Add tags..." tagListPlacement="bottom" />;
  },
};

/**
 * Vertical tag layout for better organization of many tags.
 */
export const VerticalLayout: Story = {
  render: () => {
    const [tags, setTags] = useState(['category-1', 'category-2', 'category-3', 'category-4']);
    return <TagInput tags={tags} setTags={setTags} direction="column" placeholder="Add tags..." tagListPlacement="bottom" />;
  },
};

/**
 * Tag input with tags placed inside the input field.
 */
export const InsideInput: Story = {
  render: () => {
    const [tags, setTags] = useState(['react', 'vue', 'angular']);
    return <TagInput tags={tags} setTags={setTags} tagListPlacement="inside" placeholder="Add tags..." />;
  },
};

/**
 * Tag input with tags placed above the input field.
 */
export const TopPlacement: Story = {
  render: () => {
    const [tags, setTags] = useState(['design', 'development', 'testing']);
    return <TagInput tags={tags} setTags={setTags} tagListPlacement="top" placeholder="Add tags..." />;
  },
};

/**
 * Tag input with custom badge styling.
 */
export const CustomStyling: Story = {
  render: () => {
    const [tags, setTags] = useState(['feature', 'bug', 'enhancement']);
    return (
      <TagInput
        tags={tags}
        setTags={setTags}
        placeholder="Add tags..."
        tagListPlacement="bottom"
        badgeVariants={{ variant: 'secondary' }}
        styleClasses={{
          tagList: 'gap-2',
          tag: {
            body: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200',
            closeButton: 'text-blue-600 hover:text-blue-800',
          },
        }}
      />
    );
  },
};

/**
 * Tag input with tag truncation for long tags.
 */
export const WithTruncation: Story = {
  render: () => {
    const [tags, setTags] = useState(['very-long-tag-name-that-should-be-truncated', 'another-extremely-long-tag-for-testing-purposes', 'short']);
    return <TagInput tags={tags} setTags={setTags} truncate={15} placeholder="Add tags..." tagListPlacement="bottom" />;
  },
};

/**
 * Tag input with add on blur functionality.
 */
export const AddOnBlur: Story = {
  render: () => {
    const [tags, setTags] = useState(['existing-tag']);
    return <TagInput tags={tags} setTags={setTags} addTagsOnBlur={true} placeholder="Type and click away to add tag" tagListPlacement="bottom" />;
  },
};

/**
 * Tag input with custom validation function.
 */
export const CustomValidation: Story = {
  render: () => {
    const [tags, setTags] = useState(['valid-tag-1', 'valid-tag-2']);

    const validateTag = (tag: string) => {
      // Only allow alphanumeric tags and hyphens
      return /^[a-zA-Z0-9-]+$/.test(tag);
    };

    return (
      <TagInput
        tags={tags}
        setTags={setTags}
        validateTag={validateTag}
        placeholder="Only alphanumeric characters and hyphens allowed"
        tagListPlacement="bottom"
      />
    );
  },
};

/**
 * Tag input with tag click handler.
 */
export const WithTagClick: Story = {
  render: () => {
    const [tags, setTags] = useState(['clickable', 'interactive', 'responsive']);

    const handleTagClick = (tag: string) => {
      alert(`Clicked tag: ${tag}`);
    };

    return <TagInput tags={tags} setTags={setTags} onTagClick={handleTagClick} placeholder="Click on tags to interact" tagListPlacement="bottom" />;
  },
};

/**
 * Empty tag input ready for user interaction.
 */
export const Empty: Story = {
  render: () => {
    const [tags, setTags] = useState<string[]>([]);
    return <TagInput tags={tags} setTags={setTags} placeholder="Start typing to add tags..." tagListPlacement="bottom" />;
  },
};

/**
 * Complex example with all features enabled.
 */
export const FullFeatured: Story = {
  render: () => {
    const [tags, setTags] = useState(['react', 'typescript', 'storybook', 'testing']);

    const handleTagAdd = (tag: string) => {
      console.log('Tag added:', tag);
    };

    const handleTagRemove = (tag: string) => {
      console.log('Tag removed:', tag);
    };

    const handleClearAll = () => {
      console.log('All tags cleared');
    };

    const handleTagClick = (tag: string) => {
      console.log('Tag clicked:', tag);
    };

    return (
      <div className="w-full max-w-md space-y-4">
        <div className="text-sm text-muted-foreground">Full-featured tag input with all options enabled</div>
        <TagInput
          tags={tags}
          setTags={setTags}
          placeholder="Add tags (paste supported)..."
          maxTags={10}
          minLength={2}
          maxLength={25}
          showCount={true}
          showClearAllButton={true}
          addOnPaste={true}
          addTagsOnBlur={true}
          truncate={20}
          tagListPlacement="bottom"
          badgeVariants={{ variant: 'outline' }}
          onTagAdd={handleTagAdd}
          onTagRemove={handleTagRemove}
          onClearAll={handleClearAll}
          onTagClick={handleTagClick}
          validateTag={(tag) => !tag.includes('invalid') && tag.length >= 2}
        />
        <div className="text-xs text-muted-foreground">
          <div>• Type and press Enter to add</div>
          <div>• Click tags to interact</div>
          <div>• Paste comma-separated values</div>
          <div>• Click away to add current input</div>
          <div>• Use arrow keys to navigate tags</div>
          <div>• Press Delete/Backspace on selected tags</div>
        </div>
      </div>
    );
  },
};
