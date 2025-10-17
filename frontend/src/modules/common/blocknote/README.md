# BlockNote

## Overview

**BlockNote** serves as the core text editor and has been customized to be an easy-to-configure tool tailored to your
specific needs. The key benefits include modularity and flexibility.

## BlockNote Block Customization Guide

The default BlockNote schema can be extended to include custom block types, such as **Notify** and **Mention**. For example,
you can find this custom components under `blocknote/custom-element`. For app-specific customizations, use `blocknote/
app-specific-custom`.
functions `getSideMenuItems` and `getSlashMenuItems` are required for integrating custom items into the side and slash
menus, respectively. For default Cella usage, they should look like this:

```typescript
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps["headingLevels"]>
): DefaultReactSuggestionItem[] => {
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

  // Filter heading keys based on allowed headingLevels
  const { heading, ...restTypeToKeys } = { ...baseBlocknoteTypeToKeys };
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    return headingLevels.includes(level as (typeof headingLevels)[number]);
  });

  // Build a map of allowed types to keys
  const allowedTypeToKeys = {
    ...restTypeToKeys,
    heading: filteredHeading
  };

  // Only keep types that are allowed
  const filteredTypeToKeys = Object.fromEntries(
    Object.entries(allowedTypeToKeys).filter(([type]) => allowedTypes.includes(type as CustomBlockTypes))
  );

  // Flatten the keys to filter baseItems
  const allowedKeys = Object.values(filteredTypeToKeys).flat();

  // Optional: sort by `customSlashIndexedItems`
  const sortOrder = new Map(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index]))
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => "key" in item && allowedKeys.includes(item.key as DefaultSuggestionItem["key"]))
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
};
```

These functions are used to populate the menus with the default items and any custom items added to your configuration.
However, the lists of items in the side and slash menu can be filtered.

- `customBlockTypeSwitchItems` filters the block types available in the side menu.
- props `excludeBlockTypes` and `excludeFileBlockTypes` on `BlockNote` defines blocks that available for selection in the slash menu

By filtering these lists, you can control which block types and items are available to users in the side and slash menus,
ensuring that only relevant blocks and actions are displayed.

To add a new component, import it, add it to the schema, assign its type and key, and integrate it with
`getSideMenuItems` and `getSlashMenuItems`.

### Example: Adding a Custom Summary Block

1. Import Your Custom Component
   Bring in the custom block or inline content component from your app's module.
2. Update Schema
   Add your custom component to the blockSpecs or inlineContentSpecs in the schema.
3. Integrate with Menus(optionally)
   Update getSideMenuItems and getSlashMenuItems to include the custom block in the side menu and slash menu.
4. Declare Custom Types
   Extend BlockNote's types to include your custom block type and key.

```typescript
import { Summary, getSlashSummaryItem, insertSummarySideMenu } from "~/modules/common/blocknote/app-specific-custom/summary-block";
// Base custom schema
export const customSchema = BlockNoteSchema.create().extend({
  blockSpecs: { notify: notifyBlock() }, // Adds Notify block
  inlineContentSpecs: { mention: MentionSchema } // Adds Mention tag
});

const typeToBlocknoteKeys: Record<CustomBlockTypes, SlashItemKeys[]> = {
  ...existingtypeToBlocknoteKeys,
  summary: ["summary"]
};

export const customBlockTypeSwitchItems: CustomBlockTypes[] = [...existingCustomBlockTypeSwitchItems, "summary"];
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict), insertSummarySideMenu()];

declare module "~/modules/common/blocknote/types" {
  export interface ExtendableBlocknoteTypes {
    SlashKeys: DefaultSuggestionItem["key"] | "notify" | "summary";
  }
}
// Generate the complete Slash menu items list
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps["headingLevels"]>
): DefaultReactSuggestionItem[] => {
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor), getSlashSummaryItem(editor)];

  // Filter heading keys based on allowed headingLevels
  const { heading, ...restTypeToKeys } = { ...baseBlocknoteTypeToKeys };
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    return headingLevels.includes(level as (typeof headingLevels)[number]);
  });

  // Build a map of allowed types to keys
  const allowedTypeToKeys = {
    ...restTypeToKeys,
    heading: filteredHeading
  };

  // Only keep types that are allowed
  const filteredTypeToKeys = Object.fromEntries(
    Object.entries(allowedTypeToKeys).filter(([type]) => allowedTypes.includes(type as CustomBlockTypes))
  );

  // Flatten the keys to filter baseItems
  const allowedKeys = Object.values(filteredTypeToKeys).flat();

  // Optional: sort by `customSlashIndexedItems`
  const sortOrder = new Map(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index]))
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => "key" in item && allowedKeys.includes(item.key as DefaultSuggestionItem["key"]))
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
};
```

## Allowed Types

Keys of `customSchema.blockSpecs` will be used by default. You can exclude some of the types by specifying them in the <BlockNote /> component configuration. This allows you to tailor the editor to specific needs.

Example Usage:

```tsx
<BlockNote
  id={blocknoteId}
  type='edit'
  defaultValue={value}
  onChange={onChange}
  updateData={onChange}
  className='min-h-20 pl-10 pr-6 p-3 border rounded-md'
  excludeBlockTypes={["emoji", "heading", "paragraph", "codeBlock"]} // Exclude usage of this specific block types
  excludeFileBlockTypes={["image", "file"]} // Exclude image and file uploads
  baseFilePanelProps={ organizationId: 'adminPreview' }
/>
```

## Side menu

Our BlockNote component uses a custom side menu button. The block types specified in `customBlockTypeSwitchItems` will
trigger the side menu to open when their side button is clicked. For other block types, this button only executes the
drag functionality, and clicking on it has no additional effect.

The menu will include blocks that are assigned in `getSideMenuItems` and filter them using `customBlockTypeSwitchItems`.
Essentially, `customBlockTypeSwitchItems` allows you to filter out basic blocks from the side menu. However, when adding
a custom block, it must be explicitly added to both `getSideMenuItems` and `customBlockTypeSwitchItems` for it to appear
in the side menu.

## Slash menu

The slash menu is divided into two parts: indexed and not-indexed. This setup allows users to quickly select blocks by their
number when interacting with the slash menu.

The indexed items are defined in `customSlashIndexedItems`, while all others become the not-indexed. Items are added by
their key rather than their type. It’s important to note that the number of indexed items should not exceed 9;
otherwise, the functionality may not work as expected. Custom items are added to the slash menu using the
`getSlashMenuItems` function.

## File Upload

You can integrate file uploads into your BlockNote editor either by using the default BlockNote file panel, providing your own custom file panel, or by using our prebuilt `UppyFilePanel`.

### Using the Default UppyFilePanel

Our default `UppyFilePanel` is a fully featured upload panel combining Uppy with Transloadit for powerful file handling. It supports publicity, multiple file types, image editing, screen capture, webcam, audio, and URL uploads — all configurable based on the type of block you are working with.

To enable and use the default `UppyFilePanel`, you need to:

- **Set Upload Config:**  
  Ensure your `config` object includes valid Transloadit settings and enable upload feature with:

  ```ts
  appConfig.has.uploadEnabled = true;
  ```

- **Pass baseFilePanelProps:**
  Provide necessary props like organizationId and block data as BaseUppyFilePanelProps to the file panel. You can also include isPublic; by default, isPublic = false to keep uploads private.
- **Use CustomFilePanel component:**
  This component conditionally renders the UppyFilePanel when uploads are enabled, or you can override it by passing your own custom filePanel prop.

Example Usage:

```tsx
const baseFilePanelProps: BaseUppyFilePanelProps = {
  organizationId: "org_12345",
  isPublic: true,
  onComplete: (result) => console.info("Upload complete", result),
  onError: (error) => console.error("Upload error", error)
};

<BlockNote
  id={blocknoteId}
  type='edit'
  defaultValue={value}
  onChange={onChange}
  updateData={onChange}
  className='min-h-20 pl-10 pr-6 p-3 border rounded-md'
  baseFilePanelProps={baseFilePanelProps}
/>;
```
