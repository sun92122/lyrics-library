import { defineConfig } from "astro/config";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    react(),
  ],
  vite: {
    plugins: [
      nodePolyfills({
        include: ["crypto", "buffer"],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
  },
  markdown: {
    remarkPlugins: [["remark-github-blockquote-alert", {}]],
  },
});
