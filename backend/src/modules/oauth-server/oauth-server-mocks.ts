import { mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import { protectedResourceMetadata, type ResourceRef } from '#/modules/oauth-server/resources';

export const mockProtectedResourceResponse = (face: ResourceRef['face'] = 'api', key = `protectedResource:${face}`) =>
  withFakerSeed(key, () => {
    const tenantId = mockTenantId();
    return protectedResourceMetadata(face === 'mcp' ? { face, tenantId, organizationId: mockUuid() } : { face, tenantId });
  });
