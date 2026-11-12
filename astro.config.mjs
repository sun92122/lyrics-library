import { defineConfig } from "astro/config";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import { unified } from "@astrojs/markdown-remark";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));

function copyPdfjsWasm() {
  const files = [
    "jbig2.wasm",
    "jbig2_nowasm_fallback.js",
    "openjpeg.wasm",
    "openjpeg_nowasm_fallback.js",
    "qcms_bg.wasm",
  ];
  const src = `${here}/node_modules/pdfjs-dist/wasm`;
  const dst = `${here}/public/redist/pdfjs`;
  const copy = () => {
    if (!existsSync(src)) return;
    mkdirSync(dst, { recursive: true });
    for (const f of files) {
      const from = `${src}/${f}`;
      if (existsSync(from)) copyFileSync(from, `${dst}/${f}`);
    }
  };
  return {
    name: "copy-pdfjs-wasm",
    buildStart: copy,
    configureServer: copy,
  };
}

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
      copyPdfjsWasm(),
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
    processor: unified({
      remarkPlugins: [["remark-github-blockquote-alert", {}]],
    }),
  },
});
