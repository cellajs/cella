# BlockNote

## Overview

**BlockNote** serves as the core text editor and has been customized to be an easy-to-configure tool tailored to your specific
needs. The key benefits include modularity and flexibility.

## BlockNote Block Customization Guide

The default BlockNote schema can be extended to include custom block types, such as **Notify** and **Mention**. For example,
you can find this custom components under `blocknote/custom-element`. For app-specific customizations, use `blocknote/
app-specific-custom`.
functions `getSideMenuItems` and `getSlashMenuItems` are required for integrating custom items into the side and slash menus,
respectively. For default Cella usage, they should look like this:

```typescript
export const getSlashMenuItems = (editor: CustomBlockNoteEditor) => [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];
```

These functions are used to populate the menus with the default items and any custom items added to your configuration.
However, the lists of items in the side and slash menus are also filtered by `customBlockTypeSelectItems`,
`customSlashNotIndexedItems`, and `customSlashIndexedItems`.

- `customBlockTypeSelectItems` filters the block types available in the side menu.
- `customSlashIndexedItems` & `customSlashNotIndexedItems` defines blocks that available for selection in the slash menu

By filtering these lists, you can control which block types and items are available to users in the side and slash menus,
ensuring that only relevant blocks and actions are displayed.

To add a new component, import it, add it to the schema, assign its type and key, and integrate it with `getSideMenuItems`
and `getSlashMenuItems`.

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

export const customSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    notify: Notify, // Notify block
    summary: Summary // Summary block
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: MentionSchema // Mention tag
  }
});

export const menusTitleToAllowedType = {
  ...existingMenusTitleToAllowedType,
  Summary: "summary"
};

export const customBlockTypeSelectItems: CustomBlockTypes[] = [...existingCustomBlockTypeSelectItems, "summary"];
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict), insertSummarySideMenu()];

export const getSlashMenuItems = (editor: CustomBlockNoteEditor) => [
  ...getDefaultReactSlashMenuItems(editor),
  getSlashNotifySlashItem(editor),
  getSlashSummaryItem(editor)
];

declare module "~/modules/common/blocknote/types" {
  export interface ExtendableBlocknoteTypes {
    SlashKeys: DefaultSuggestionItem["key"] | "notify" | "summary";
  }
}
```

## Allowed Types

The `allowedTypes` property defines the basic block types that Blocknote will handle. Types assigned to `allowedTypes` will be
used by default. You can exclude some of the types by specifying them in the <BlockNote /> component configuration. This allows you to tailor the editor to specific needs.

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

Our BlockNote component uses a custom side menu button. The block types specified in `sideMenuOpenOnTypes` will trigger the
side menu to open when their side button is clicked. For other block types, this button only executes the drag functionality,
and clicking on it has no additional effect.

The menu will include blocks that are assigned in `getSideMenuItems` and filter them using `customBlockTypeSelectItems`.
Essentially, `customBlockTypeSelectItems` allows you to filter out basic blocks from the side menu. However, when adding a
custom block, it must be explicitly added to both `getSideMenuItems` and `customBlockTypeSelectItems` for it to appear in the
side menu.

## Slash menu

The slash menu is divided into two parts: indexed and not-indexed. This setup allows users to quickly select blocks by their
number when interacting with the slash menu.

The indexed items are defined in `customSlashIndexedItems`, while the not-indexed items are listed in
`customSlashNotIndexedItems`. Items are added by their key rather than their type. It’s
important to note that the number of indexed items should not exceed 9; otherwise, the functionality may not work as expected.
Custom items are added to the slash menu using the `getSlashMenuItems` function.

## File Upload

You can integrate file uploads into your BlockNote editor either by using the default BlockNote file panel, providing your own custom file panel, or by using our prebuilt `UppyFilePanel`.

### Using the Default UppyFilePanel

Our default `UppyFilePanel` is a fully featured upload panel combining Uppy with Transloadit for powerful file handling. It supports multiple file types, image editing, screen capture, webcam, audio, and URL uploads — all configurable based on the type of block you are working with.

To enable and use the default `UppyFilePanel`, you need to:

- **Set Upload Config:**  
  Ensure your `config` object includes valid Transloadit settings and enable upload feature with:

  ```ts
  config.has.uploadEnabled = true;
  ```

- **Pass baseFilePanelProps:**
  Provide necessary props like organizationId and block data as BaseUppyFilePanelProps to the file panel.
- **Use CustomFilePanel component:**
  This component conditionally renders the UppyFilePanel when uploads are enabled, or you can override it by passing your own custom filePanel prop.

Example Usage:

```tsx
const baseFilePanelProps: BaseUppyFilePanelProps = {
  organizationId: "org_12345",
  onComplete: (result) => console.log("Upload complete", result),
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
