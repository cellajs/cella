import type { BlockConfig, PropSchema } from '@blocknote/core';
import type { DescriptionBlock } from '../utils/text-from-block.ts';

/** The app's own BlockNote block configs, without React: the editor and the server schema build their specs from them. */
export const appBlockConfigs: Record<string, BlockConfig<string, PropSchema, 'none'>> = {};

/** The app's blocks that show one file the way a media block does: its reference in `url`, its file name in `name`. */
export const appMediaBlockTypes = [] as const satisfies readonly (keyof typeof appBlockConfigs)[];

/** The carousel content type of each app media block. */
export const appMediaContentType = {} as const satisfies Record<(typeof appMediaBlockTypes)[number], string>;

/** The attachment ids a block references beyond its `url`. */
export const appBlockAttachmentIds = (_block: DescriptionBlock): string[] => [];
