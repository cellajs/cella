import { defineConfig } from '@hey-api/openapi-ts'
import { config } from 'config'

// , runtimeConfigPath: './src/lib/api-config.ts' not working in client-axios plugin?
// TODO watch mode isnt great, can we somehow compare openapi changes only on restart of backend
export default defineConfig({
  input: { path: `${config.backendUrl}/openapi.json`, watch: false },
  output: { path: 'src/openapi-client', lint: 'biome', format: 'biome' },
  plugins: ['zod', { name: '@hey-api/sdk', responseStyle: 'data'},  {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './hey-api.ts', 
    },],
})
