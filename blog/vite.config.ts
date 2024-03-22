import path from "path";
import pages from "@hono/vite-cloudflare-pages";
import honox from "honox/vite";
import { defineConfig } from "vite";
import client from "honox/vite/client";

export default defineConfig(({ mode }) => {
  const common = {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./app"),
      },
    },
  };

  if (mode === "client") {
    return {
      ...common,
      plugins: [client({ jsxImportSource: "react" })],
      build: {
        rollupOptions: {
          input: ["./app/client.ts", "/app/tailwind.css"],
          output: {
            entryFileNames: "static/client.js",
            chunkFileNames: "static/assets/[name]-[hash].js",
            assetFileNames: "static/assets/[name].[ext]",
          },
        },
      },
    };
  } else {
    return {
      ...common,
      ssr: { external: ["react", "react-dom"] },
      plugins: [honox(), pages()],
    };
  }
});
