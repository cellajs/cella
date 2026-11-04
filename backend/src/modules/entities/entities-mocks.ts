/** The OpenAPI example of a catchup answer. */
export const mockCatchupResponse = () => ({
  organizations: {
    'org-example-id': { signals: { 'membership.changed': 1 } },
  },
});
