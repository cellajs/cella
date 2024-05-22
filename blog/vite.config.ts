import path from "path";
import pages from "@hono/vite-cloudflare-pages";
import honox from "honox/vite";
import mdx from "@mdx-js/rollup";
import rehypeHighlight from "rehype-highlight";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import client from "honox/vite/client";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const common = {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./app"),
        "~": path.resolve(__dirname, "../frontend/src"),
      },
    },
    optimizeDeps: {
      exclude: ["stream", "http", "url", "punycode", "https", "zlib"],
    },
  };
  if (mode === "client") {
    return {
      ...common,
      plugins: [client({ jsxImportSource: "react" })],
      build: {
        rollupOptions: {
          input: ["./app/client.ts", "/app/index.css"],
          output: {
            entryFileNames: "static/client.js",
            chunkFileNames: "static/assets/[name]-[hash].js",
            assetFileNames: "static/assets/[name].[ext]",
          },
          external: [""],
        },
      },
    };
  }
  return {
    ...common,
    build: {
      emptyOutDir: false,
    },
    ssr: {
      noExternal: ["!stream", "!http", "!url", "!punycode", "!https", "!zlib"],
      external: [
        "react",
        "react-dom",
        "void-elements",
        "html-parse-stringify",
        "react-i18next",
        "use-sync-external-store",
        "html-parse-stringify",
        "stream",
        "http",
        "url",
        "punycode",
        "https",
        "zlib",
      ],
    },
    plugins: [
      honox(),
      pages(),
      mdx({
        jsxImportSource: "react",
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
        rehypePlugins: [rehypeHighlight],
      }),
    ],
  };
});
