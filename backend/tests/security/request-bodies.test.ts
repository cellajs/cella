import { describe, expect, it } from 'vitest';

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * A request body that is not required skips validation when the request carries no Content-Type, and the handler then
 * reads an empty object. So every operation that takes a body requires it, and a bodiless request answers 400. The
 * table is the API itself, read from the app's own OpenAPI document.
 */
describe('request bodies', () => {
  it('must not accept a bodiless request on an operation that takes a body', async () => {
    const { baseApp } = await import('#/routes');
    const { paths = {} } = baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'bodies', version: '0' } });

    const optional = Object.values(paths).flatMap((item) =>
      httpMethods.flatMap((method) => {
        const operation = item[method];
        const body = operation?.requestBody;
        return body && !('$ref' in body) && !body.required ? [String(operation.operationId)] : [];
      }),
    );
    // Its body carries only the page to return to.
    expect(optional).toEqual(['sendStepUpLink']);
  });
});
