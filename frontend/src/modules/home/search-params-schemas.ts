import { booleanSearchParam, userSheetSearchSchema } from '~/modules/common/search-params-schemas';

/** `skipWelcome` keeps a user still onboarding on the home page. */
export const homeRouteSearchParamsSchema = userSheetSearchSchema.extend({ skipWelcome: booleanSearchParam });
