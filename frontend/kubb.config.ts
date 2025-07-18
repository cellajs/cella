
import { defineConfig } from '@kubb/core'
import { pluginOas } from '@kubb/plugin-oas'
import { pluginTs } from '@kubb/plugin-ts'
import { pluginZod } from "@kubb/plugin-zod";
// import { pluginClient } from '@kubb/plugin-client'

export default defineConfig(() => {
  return {
    root: '.',
    input: {
      path: '../backend/openapi.cache.json',
    },
    output: {
      path: './src/gen',
    },
    plugins: [
      pluginOas(),
      pluginTs(),
      pluginZod(),
    ],
  }
})