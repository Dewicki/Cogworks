import { defineConfig } from "vite";

// Cog comes in as the cog-lang package (see src/cog.ts). While it is a file: link to
// a sibling checkout, it lives outside this folder, so the dev server must be allowed to serve it.
export default defineConfig({
  // Relative paths so the build works on GitHub Pages under /<repo>/.
  base: "./",
  server: { fs: { allow: ["../.."] } },
  build: { target: "es2022" },
});
