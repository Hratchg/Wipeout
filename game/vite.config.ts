import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs so the same build works on localhost, GitHub Pages,
  // or any static host — not only at the domain root.
  base: "./",
  server: { host: true, port: 5173 },
});
