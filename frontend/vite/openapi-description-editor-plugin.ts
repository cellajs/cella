import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ObjectLiteralExpression, Project, type PropertyAssignment, SyntaxKind } from 'ts-morph';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Vite plugin for editing OpenAPI descriptions in development mode.
 *
 * This plugin:
 * 1. Adds a dev server endpoint to handle description updates
 * 2. Uses ts-morph to update the backend route source files
 * 3. Updates the frontend operations.gen.ts directly
 * 4. Triggers HMR for just that file (no full rebuild)
 *
 * Only active in development mode.
 */

// Cache the ts-morph project for performance
let project: Project | null = null;

function getProject(backendPath: string): Project {
  if (!project) {
    project = new Project({
      tsConfigFilePath: resolve(backendPath, 'tsconfig.json'),
    });
  }
  return project;
}

/**
 * Find and update the description for a specific operationId
 */
function updateBackendDescription(
  backendPath: string,
  operationId: string,
  newDescription: string,
): { success: boolean; filePath?: string; error?: string } {
  try {
    const proj = getProject(backendPath);

    // Get route files - use the src path explicitly
    const srcPath = resolve(backendPath, 'src');
    const routeFiles = proj.addSourceFilesAtPaths(`${srcPath}/modules/**/routes.ts`);

    for (const sourceFile of routeFiles) {
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

      for (const call of callExpressions) {
        const expression = call.getExpression();
        if (expression.getText() !== 'createCustomRoute') continue;

        const args = call.getArguments();
        if (args.length === 0) continue;

        const configArg = args[0];
        if (!configArg.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

        const objectLiteral = configArg as ObjectLiteralExpression;

        // Check if this is the right operationId
        const operationIdProp = objectLiteral.getProperty('operationId');
        if (!operationIdProp || !operationIdProp.isKind(SyntaxKind.PropertyAssignment)) continue;

        const initializer = (operationIdProp as PropertyAssignment).getInitializer();
        if (!initializer) continue;

        const value = initializer.getText().replace(/['"]/g, '');
        if (value !== operationId) continue;

        // Found the right route, now find description property
        const descriptionProp = objectLiteral.getProperty('description');
        if (!descriptionProp || !descriptionProp.isKind(SyntaxKind.PropertyAssignment)) continue;

        // Escape and set the new value
        const isMultiLine = newDescription.includes('\n');
        if (isMultiLine) {
          const escaped = newDescription.replace(/`/g, '\\`').replace(/\${/g, '\\${');
          (descriptionProp as PropertyAssignment).setInitializer(`\`${escaped}\``);
        } else {
          const escaped = newDescription.replace(/'/g, "\\'");
          (descriptionProp as PropertyAssignment).setInitializer(`'${escaped}'`);
        }

        // Save the file
        sourceFile.saveSync();

        // Clear project cache to pick up changes
        project = null;

        return { success: true, filePath: sourceFile.getFilePath() };
      }
    }

    return { success: false, error: `operationId "${operationId}" not found in route files` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Update the operations.gen.ts file directly with the new description
 */
function updateOperationsFile(operationsFilePath: string, operationId: string, newDescription: string): boolean {
  try {
    const content = readFileSync(operationsFilePath, 'utf-8');

    // Parse the operations array
    const match = content.match(/export const operations: OperationSummary\[\] = (\[[\s\S]*\]);/);
    if (!match) return false;

    const operations = JSON.parse(match[1]);

    // Find and update the operation
    const operation = operations.find((op: { id: string }) => op.id === operationId);
    if (!operation) return false;

    operation.description = newDescription;

    // Reconstruct the file
    const interfaceSection = content.split('export const operations')[0];
    const newContent = `${interfaceSection}export const operations: OperationSummary[] = ${JSON.stringify(operations, null, 2)};\n`;

    writeFileSync(operationsFilePath, newContent);
    return true;
  } catch {
    return false;
  }
}

export function openApiDescriptionEditorPlugin(): Plugin {
  let server: ViteDevServer;
  let backendPath: string;
  let operationsFilePath: string;

  return {
    name: 'vite-plugin-openapi-description-editor',

    // Only run in dev/serve mode
    apply: 'serve',

    configResolved(config) {
      // Resolve paths relative to project root
      const rootPath = resolve(config.root, '..');
      backendPath = resolve(rootPath, 'backend');
      operationsFilePath = resolve(config.root, 'src/api.gen/docs/operations.gen.ts');
    },

    configureServer(_server) {
      server = _server;

      // Add middleware BEFORE Vite's internal middlewares (by not returning a function)
      // This ensures our endpoint is handled before the SPA fallback
      server.middlewares.use('/__openapi-description-editor', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
          return;
        }

        // Parse JSON body
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        try {
          const { operationId, description } = JSON.parse(body);

          if (!operationId || typeof description !== 'string') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Missing operationId or description' }));
            return;
          }

          // 1. Update backend source code
          const backendResult = updateBackendDescription(backendPath, operationId, description);

          if (!backendResult.success) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(backendResult));
            return;
          }

          // 2. Update the operations.gen.ts file directly
          const frontendUpdated = updateOperationsFile(operationsFilePath, operationId, description);

          // 3. Trigger HMR for the operations file
          if (frontendUpdated) {
            const module = server.moduleGraph.getModuleById(operationsFilePath);
            if (module) {
              server.moduleGraph.invalidateModule(module);
              server.ws.send({
                type: 'full-reload',
                path: '*',
              });
            }
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: true,
              filePath: backendResult.filePath,
              frontendUpdated,
            }),
          );
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            }),
          );
        }
      });
    },
  };
}

export default openApiDescriptionEditorPlugin;
