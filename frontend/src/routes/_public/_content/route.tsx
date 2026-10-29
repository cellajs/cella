import { createFileRoute } from '@tanstack/react-router';

/** Sublayout for public content routes; auth, sign-out, error and marketing routes skip it. */
export const Route = createFileRoute('/_public/_content')({ staticData: { isAuth: false, boundary: 'public' } });
